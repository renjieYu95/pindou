(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BeadEngine = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const MAX_SIDE = 128;
  function rgb(hex) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
  function lab(r, g, b) {
    const [R, G, B] = [r, g, b].map(v => { v /= 255; return v > .04045 ? Math.pow((v + .055) / 1.055, 2.4) : v / 12.92; });
    const f = v => v > .008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
    const x = f((R * .4124564 + G * .3575761 + B * .1804375) / .95047);
    const y = f(R * .2126729 + G * .7151522 + B * .0721750);
    const z = f((R * .0193339 + G * .1191920 + B * .9503041) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
  }
  function distance(a, b) { return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; }
  function preparePalette(palette) { return palette.colors.map(c => Object.assign({}, c, { lab: lab(...rgb(c.hex)) })); }
  function nearest(v, colors) {
    let winner = 0, best = Infinity;
    colors.forEach((c, i) => { const d = distance(v, c.lab); if (d < best) { best = d; winner = i; } });
    return winner;
  }
  function dimensions(width, aspect) {
    const w = Math.max(16, Math.min(MAX_SIDE, Math.round(Number(width) || 48)));
    return { width: w, height: Math.max(1, Math.min(MAX_SIDE, Math.round(w / (aspect || 1)))) };
  }
  // Source canvas is bounded before this function; alpha-weighted block averages
  // keep invisible RGB from contaminating the edges of transparent artwork.
  function sample(data, sw, sh, width, height, options) {
    if (!data || data.length !== sw * sh * 4) throw Error('图片像素数据不完整');
    const result = [], opts = options || {};
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, alpha = 0, n = 0;
      let x0 = Math.floor(x * sw / width), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / width));
      let y0 = Math.floor(y * sh / height), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / height));
      if (opts.sampling === 'nearest') { x0 = Math.min(sw - 1, Math.floor((x + .5) * sw / width)); y0 = Math.min(sh - 1, Math.floor((y + .5) * sh / height)); x1 = x0 + 1; y1 = y0 + 1; }
      for (let sy = y0; sy < Math.min(sh, y1); sy++) for (let sx = x0; sx < Math.min(sw, x1); sx++) {
        const p = (sy * sw + sx) * 4, a = data[p + 3] / 255;
        r += data[p] * a; g += data[p + 1] * a; b += data[p + 2] * a; alpha += a; n++;
      }
      if (opts.background !== 'white' && (!n || alpha / n < .35)) { result.push(null); continue; }
      if (opts.background === 'white') { r += 255 * (n - alpha); g += 255 * (n - alpha); b += 255 * (n - alpha); alpha = n; }
      result.push([r / alpha, g / alpha, b / alpha].map(Math.round));
    }
    return result;
  }
  function quantize(samples, width, height, palette, options) {
    if (samples.length !== width * height || width > MAX_SIDE || height > MAX_SIDE || width < 1 || height < 1) throw Error('图纸尺寸无效');
    const opts = options || {}, all = preparePalette(palette).filter(c => c.code !== 'H1');
    const cache = new Map(), counts = new Map();
    const labs = samples.map(c => c ? lab(...c) : null);
    const mapped = samples.map((c, i) => {
      if (!c) return null;
      const key = c.join(',');
      if (!cache.has(key)) cache.set(key, nearest(labs[i], all));
      const p = cache.get(key); counts.set(p, (counts.get(p) || 0) + 1); return p;
    });
    const limit = Math.max(1, Math.min(all.length, Math.round(Number(opts.maxColors) || 24)));
    const entries = Array.from(counts, ([i, count]) => ({ i, count })).sort((a, b) => b.count - a.count || a.i - b.i);
    let chosen = entries.map(e => e.i);
    if (chosen.length > limit) {
      // Frequency-weighted farthest colors retain small but distinctive details.
      chosen = [entries[0].i];
      while (chosen.length < limit) {
        let best = -1, winner = -1;
        entries.forEach(e => {
          if (chosen.includes(e.i)) return;
          const score = Math.min(...chosen.map(i => distance(all[e.i].lab, all[i].lab))) * Math.sqrt(e.count);
          if (score > best) { best = score; winner = e.i; }
        });
        chosen.push(winner);
      }
      // Refine each group to the nearest real, opaque palette color.
      for (let pass = 0; pass < 4; pass++) {
        const centers = chosen.map(() => ({ sum: [0, 0, 0], n: 0 }));
        const sub = chosen.map(i => all[i]);
        entries.forEach(e => { const a = centers[nearest(all[e.i].lab, sub)]; a.n += e.count; all[e.i].lab.forEach((v, k) => { a.sum[k] += v * e.count; }); });
        const next = [];
        centers.forEach((a, i) => { const p = a.n ? nearest(a.sum.map(v => v / a.n), all) : chosen[i]; if (!next.includes(p)) next.push(p); });
        chosen = next;
      }
    }
    const sub = chosen.map(i => all[i]), remap = new Map();
    let cells = mapped.map((p, i) => {
      if (p === null) return null;
      const key = samples[i].join(',');
      if (!remap.has(key)) remap.set(key, sub[nearest(labs[i], sub)].code);
      return remap.get(key);
    });
    if (opts.denoise) cells = denoise(cells, width, height, palette);
    return { version: 1, width, height, cells, palette: JSON.parse(JSON.stringify(palette)), settings: Object.assign({}, opts), title: '我的拼豆作品', createdAt: Date.now(), updatedAt: Date.now() };
  }
  function denoise(cells, width, height, palette) {
    const out = cells.slice(), colors = new Map(preparePalette(palette).map(c => [c.code, c]));
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x, c = cells[i];
      if (!c) continue;
      const ns = [cells[i - 1], cells[i + 1], cells[i - width], cells[i + width]];
      if (ns[0] && ns.every(n => n === ns[0]) && ns[0] !== c && distance(colors.get(c).lab, colors.get(ns[0]).lab) < 225) out[i] = ns[0];
    }
    return out;
  }
  function statistics(project) {
    const counts = new Map();
    project.cells.forEach(c => { if (c !== null) counts.set(c, (counts.get(c) || 0) + 1); });
    return project.palette.colors.filter(c => counts.has(c.code)).map(c => Object.assign({}, c, { count: counts.get(c.code) })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  }
  function validate(project) {
    if (!project || project.version !== 1 || !Number.isInteger(project.width) || !Number.isInteger(project.height) || project.width < 1 || project.height < 1 || project.width > MAX_SIDE || project.height > MAX_SIDE) throw Error('不支持的作品格式或尺寸');
    if (!Array.isArray(project.cells) || project.cells.length !== project.width * project.height) throw Error('作品网格数据损坏');
    if (!project.palette || !Array.isArray(project.palette.colors) || project.palette.colors.length < 1 || project.palette.colors.length > 500) throw Error('作品色卡缺失');
    const codes = new Set();
    project.palette.colors.forEach(c => {
      if (!c || typeof c.code !== 'string' || !/^[a-zA-Z0-9-]{1,12}$/.test(c.code) || !/^#[0-9a-fA-F]{6}$/.test(c.hex) || codes.has(c.code)) throw Error('作品色卡无效');
      codes.add(c.code);
    });
    if (project.cells.some(c => c !== null && !codes.has(c))) throw Error('作品包含未知色号');
    if (typeof project.title !== 'string' || project.title.length > 40) throw Error('作品标题无效');
    return project;
  }
  function changeCells(project, edits) {
    const patch = [];
    edits.forEach(({ index, code }) => { if (index >= 0 && index < project.cells.length && project.cells[index] !== code) { patch.push({ index, before: project.cells[index], after: code }); project.cells[index] = code; } });
    return patch;
  }
  function replaceColor(project, from, to) { return changeCells(project, project.cells.reduce((a, c, index) => { if (c === from) a.push({ index, code: to }); return a; }, [])); }
  function replay(project, patch, undo) { patch.forEach(e => { project.cells[e.index] = undo ? e.before : e.after; }); }
  function line(x0, y0, x1, y1) {
    const points = [], dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1, dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) { points.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e = error * 2; if (e >= dy) { error += dy; x0 += sx; } if (e <= dx) { error += dx; y0 += sy; } }
    return points;
  }
  function csv(project) { return '\uFEFF品牌,色号,HEX,数量\n' + statistics(project).map(c => 'MARD,' + c.code + ',' + c.hex + ',' + c.count).join('\n'); }
  return { MAX_SIDE, rgb, lab, distance, dimensions, sample, quantize, statistics, validate, changeCells, replaceColor, replay, line, csv };
});
