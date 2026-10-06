(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine'));
  else root.BeadRender = factory(root.BeadEngine);
})(typeof globalThis !== 'undefined' ? globalThis : this, function(E) {
  'use strict';
  const ink = '#243b36';
  function contrast(hex) { const [r, g, b] = E.rgb(hex); return r * .299 + g * .587 + b * .114 > 155 ? '#23352f' : '#ffffff'; }
  function checker(ctx, w, h, size) {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#eceee9';
    for (let y = 0; y < h; y += size) for (let x = 0; x < w; x += size) if ((Math.floor(x / size) + Math.floor(y / size)) % 2 === 0) ctx.fillRect(x, y, size, size);
  }
  function source(ctx, image, w, h, opts) {
    ctx.clearRect(0, 0, w, h);
    if (opts.background === 'white') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    const turn = opts.rotation || 0, swap = turn % 180 !== 0;
    const iw = swap ? image.height : image.width, ih = swap ? image.width : image.height;
    const scale = (opts.fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(w / iw, h / ih)) * (opts.cropZoom || 1);
    const dx = (opts.offsetX || 0) * Math.max(0, iw * scale - w) / 2;
    const dy = (opts.offsetY || 0) * Math.max(0, ih * scale - h) / 2;
    ctx.save(); ctx.translate(w / 2 + dx, h / 2 + dy); ctx.rotate(turn * Math.PI / 180); ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = opts.sampling !== 'nearest';
    ctx.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height); ctx.restore();
  }
  function grid(ctx, project, config) {
    const c = Object.assign({ x: 0, y: 0, cell: 10, fromX: 0, fromY: 0, cols: project.width, rows: project.height, mode: 'beads', grid: false, labels: false }, config);
    const colors = new Map(project.palette.colors.map(color => [color.code, color.hex]));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = Math.max(7, c.cell * .29) + 'px sans-serif';
    for (let y = 0; y < c.rows; y++) for (let x = 0; x < c.cols; x++) {
      const px = c.x + x * c.cell, py = c.y + y * c.cell;
      if (c.clip && (px + c.cell < 0 || py + c.cell < 0 || px > c.clip.width || py > c.clip.height)) continue;
      const code = project.cells[(y + c.fromY) * project.width + x + c.fromX];
      if (code === null) {
        ctx.fillStyle = ((x + c.fromX + y + c.fromY) % 2) ? '#f0f1ec' : '#fafbf8'; ctx.fillRect(px, py, c.cell, c.cell);
        if (c.labels) { ctx.fillStyle = '#afb7b0'; ctx.fillText('·', px + c.cell / 2, py + c.cell / 2); }
        continue;
      }
      ctx.fillStyle = colors.get(code) || '#ff00ff';
      if (c.mode === 'beads' && c.cell >= 3) {
        ctx.beginPath(); ctx.arc(px + c.cell / 2, py + c.cell / 2, c.cell * .46, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(25,45,34,.22)'; ctx.beginPath(); ctx.arc(px + c.cell / 2, py + c.cell / 2, c.cell * .12, 0, Math.PI * 2); ctx.fill();
      } else ctx.fillRect(px, py, c.cell + .15, c.cell + .15);
      if (c.labels && c.cell >= 19) { ctx.fillStyle = contrast(colors.get(code)); ctx.fillText(code, px + c.cell / 2, py + c.cell / 2); }
    }
    if (c.grid && c.cell >= 5) {
      for (let x = 0; x <= c.cols; x++) {
        const major = (x + c.fromX) % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(32,53,46,.5)' : 'rgba(32,53,46,.16)'; ctx.lineWidth = major ? 1 : .5;
        ctx.beginPath(); ctx.moveTo(c.x + x * c.cell, c.y); ctx.lineTo(c.x + x * c.cell, c.y + c.rows * c.cell); ctx.stroke();
      }
      for (let y = 0; y <= c.rows; y++) {
        const major = (y + c.fromY) % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(32,53,46,.5)' : 'rgba(32,53,46,.16)'; ctx.lineWidth = major ? 1 : .5;
        ctx.beginPath(); ctx.moveTo(c.x, c.y + y * c.cell); ctx.lineTo(c.x + c.cols * c.cell, c.y + y * c.cell); ctx.stroke();
      }
    }
  }
  function viewport(ctx, project, width, height, state) {
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#eaece5'; ctx.fillRect(0, 0, width, height);
    const cell = Math.min((width - 32) / project.width, (height - 32) / project.height) * (state.zoom || 1);
    const x = (width - project.width * cell) / 2 + (state.panX || 0), y = (height - project.height * cell) / 2 + (state.panY || 0);
    ctx.fillStyle = '#fafbf8'; ctx.fillRect(x, y, project.width * cell, project.height * cell);
    grid(ctx, project, { x, y, cell, mode: state.mode || 'beads', grid: state.mode === 'grid', labels: state.mode === 'grid', clip: { width, height } });
    return { x, y, cell };
  }
  function exportPlan(project, type) {
    if (type === 'effect') return [{ kind: 'effect', width: Math.max(600, project.width * 12 + 96), height: Math.max(320, project.height * 12 + 190) }];
    const pages = [];
    for (let y = 0; y < project.height; y += 48) for (let x = 0; x < project.width; x += 48) {
      const cols = Math.min(48, project.width - x), rows = Math.min(48, project.height - y);
      pages.push({ kind: 'grid', fromX: x, fromY: y, cols, rows, width: Math.max(760, cols * 32 + 128), height: Math.max(360, rows * 32 + 220) });
    }
    const stats = E.statistics(project);
    for (let from = 0; from < stats.length; from += 48) pages.push({ kind: 'legend', from, width: 1200, height: 250 + Math.ceil(Math.min(48, stats.length - from) / 3) * 72 });
    return pages;
  }
  function exportPage(ctx, project, page, index, total) {
    const w = page.width, h = page.height, stats = E.statistics(project), count = stats.reduce((n, c) => n + c.count, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = ink; ctx.font = 'bold 28px sans-serif'; ctx.fillText('豆屿 / ' + project.title.slice(0, 16), 40, 50);
    ctx.fillStyle = '#718078'; ctx.font = '18px sans-serif'; ctx.fillText(project.width + ' × ' + project.height + ' 格  ·  ' + count + ' 颗  ·  ' + stats.length + ' 色  ·  ' + project.palette.name, 40, 82);
    if (page.kind === 'effect') {
      const cell = Math.min((w - 96) / project.width, (h - 170) / project.height);
      grid(ctx, project, { x: (w - project.width * cell) / 2, y: 112, cell });
    } else if (page.kind === 'grid') {
      const ox = 64, oy = 140, cell = 32;
      grid(ctx, project, { x: ox, y: oy, cell, fromX: page.fromX, fromY: page.fromY, cols: page.cols, rows: page.rows, mode: 'grid', grid: true, labels: true });
      ctx.fillStyle = ink; ctx.font = '13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let x = 0; x < page.cols; x++) ctx.fillText(String(page.fromX + x + 1), ox + (x + .5) * cell, oy - 20);
      for (let y = 0; y < page.rows; y++) ctx.fillText(String(page.fromY + y + 1), ox - 24, oy + (y + .5) * cell);
      ctx.textAlign = 'left'; ctx.font = '17px sans-serif';
      ctx.fillText('列 ' + (page.fromX + 1) + '–' + (page.fromX + page.cols) + ' / 行 ' + (page.fromY + 1) + '–' + (page.fromY + page.rows) + '    · = 空格，不放豆子', 40, h - 48);
    } else {
      ctx.fillStyle = ink; ctx.font = 'bold 24px sans-serif'; ctx.fillText('用豆清单 / 按用量排序', 40, 130);
      stats.slice(page.from, page.from + 48).forEach((c, i) => {
        const x = 40 + (i % 3) * 380, y = 160 + Math.floor(i / 3) * 72;
        ctx.fillStyle = c.hex; ctx.fillRect(x, y, 42, 42); ctx.strokeStyle = '#cfd4ce'; ctx.lineWidth = 1; ctx.strokeRect(x, y, 42, 42);
        ctx.fillStyle = ink; ctx.font = 'bold 20px sans-serif'; ctx.fillText(c.code, x + 60, y + 19);
        ctx.fillStyle = '#718078'; ctx.font = '17px sans-serif'; ctx.fillText(c.hex.toUpperCase() + '   ' + c.count + ' 颗', x + 60, y + 44);
      });
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = '14px sans-serif'; ctx.fillStyle = '#849088';
    ctx.fillText('屏幕色仅供参考，以实物色卡为准 · ' + project.palette.version + ' · ' + (index + 1) + '/' + total, 40, h - 20);
  }
  return { contrast, checker, source, grid, viewport, exportPlan, exportPage };
});
