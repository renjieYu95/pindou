const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../miniprogram/core/engine');
const R = require('../miniprogram/core/render');
const palette = require('../miniprogram/data/palette');
const simple = { id: 'test', name: 'test', version: '1', colors: [{ code: 'BLACK', hex: '#000000' }, { code: 'WHITE', hex: '#ffffff' }, { code: 'RED', hex: '#ff0000' }, { code: 'BLUE', hex: '#0000ff' }] };
const project = (cells, width, height) => ({ version: 1, title: '测试', width, height, cells, palette: simple });

test('MARD data has 221 distinct real codes, all hex values valid', () => {
  assert.equal(palette.colors.length, 221); assert.equal(new Set(palette.colors.map(c => c.code)).size, 221);
  assert.equal(palette.colors.find(c => c.code === 'H7').hex, '#000000');
  palette.colors.forEach(c => assert.match(c.hex, /^#[0-9a-f]{6}$/));
});
test('sRGB to Lab has expected white and black reference points', () => {
  assert.ok(Math.abs(E.lab(255, 255, 255)[0] - 100) < .001); assert.ok(Math.abs(E.lab(0, 0, 0)[0]) < .001);
  assert.ok(E.lab(255, 0, 0)[1] > 70);
});
test('transparent pixels do not pollute opaque edges during averaging', () => {
  const result = E.sample(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 0]), 2, 1, 1, 1, {});
  assert.deepEqual(result, [[255, 0, 0]]);
});
test('transparent cells remain empty, white background composites alpha', () => {
  const pixels = new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 128]);
  assert.deepEqual(E.sample(pixels, 2, 1, 2, 1, {}), [null, [0, 0, 0]]);
  assert.deepEqual(E.sample(pixels, 2, 1, 2, 1, { background: 'white' }), [[255, 255, 255], [127, 127, 127]]);
});
test('nearest sampling preserves exact source colors instead of averaging', () => {
  const pixels = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
  assert.deepEqual(E.sample(pixels, 2, 1, 1, 1, { sampling: 'nearest' }), [[0, 0, 255]]);
  assert.deepEqual(E.sample(pixels, 2, 1, 1, 1, {}), [[128, 0, 128]]);
});
test('exact colors map correctly, transparency is not white or a bead', () => {
  const p = E.quantize([[255, 0, 0], [0, 0, 0], null, [255, 255, 255]], 2, 2, simple, {});
  assert.deepEqual(p.cells, ['RED', 'BLACK', null, 'WHITE']); assert.equal(E.statistics(p).reduce((n, c) => n + c.count, 0), 3);
});
test('all-transparent artwork is valid and contains zero beads', () => {
  const p = E.quantize(Array(16).fill(null), 4, 4, palette, { maxColors: 12 });
  assert.deepEqual(E.statistics(p), []); assert.equal(E.validate(p), p);
});
test('bounded quantization is deterministic, respects limits, and never invents codes', () => {
  const samples = Array.from({ length: 4096 }, (_, i) => i % 13 === 0 ? null : [(i * 47) % 256, (i * 67) % 256, (i * 101) % 256]);
  const known = new Set(palette.colors.map(c => c.code));
  for (const limit of [1, 8, 12, 24, 36]) {
    const a = E.quantize(samples, 64, 64, palette, { maxColors: limit, denoise: true });
    const b = E.quantize(samples, 64, 64, palette, { maxColors: limit, denoise: true });
    assert.deepEqual(a.cells, b.cells); assert.ok(E.statistics(a).length <= limit);
    a.cells.forEach((code, i) => { assert.equal(code === null, samples[i] === null); assert.ok(code === null || (known.has(code) && code !== 'H1')); });
  }
});
test('128 × 128 conversion fits limits and completes on CPU', () => {
  const samples = Array.from({ length: 16384 }, (_, i) => [(i * 23) % 256, (i * 59) % 256, Math.floor(i / 64) % 256]);
  const start = performance.now(); const p = E.quantize(samples, 128, 128, palette, { maxColors: 24 });
  assert.equal(p.cells.length, 16384); assert.ok(E.statistics(p).length <= 24);
  console.log('128 × 128 conversion: ' + Math.round(performance.now() - start) + ' ms (desktop Node; not phone benchmark)');
});
test('dimensions are bounded for tall and wide input', () => {
  assert.deepEqual(E.dimensions(48, 1), { width: 48, height: 48 });
  assert.deepEqual(E.dimensions(48, .01), { width: 48, height: 128 });
  assert.deepEqual(E.dimensions(48, 100), { width: 48, height: 1 });
  assert.equal(E.dimensions(500, 1).width, 128);
});
test('stroke line covers skipped pointer locations with no holes', () => {
  assert.deepEqual(E.line(0, 0, 4, 0), [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]);
  const line = E.line(1, 1, 4, 7); assert.deepEqual(line[0], [1, 1]); assert.deepEqual(line.at(-1), [4, 7]);
  line.slice(1).forEach((p, i) => assert.ok(Math.max(Math.abs(p[0] - line[i][0]), Math.abs(p[1] - line[i][1])) <= 1));
});
test('painting, erasing, replacing, undo and redo keep statistics consistent', () => {
  const p = project(['RED', 'RED', null, 'BLACK'], 2, 2);
  const edit = E.changeCells(p, [{ index: 0, code: null }, { index: 2, code: 'WHITE' }]);
  assert.deepEqual(p.cells, [null, 'RED', 'WHITE', 'BLACK']);
  E.replay(p, edit, true); assert.deepEqual(p.cells, ['RED', 'RED', null, 'BLACK']);
  E.replay(p, edit, false); assert.equal(E.statistics(p).reduce((n, c) => n + c.count, 0), 3);
  const replacement = E.replaceColor(p, 'WHITE', 'RED'); assert.equal(E.statistics(p).find(c => c.code === 'RED').count, 2);
  E.replay(p, replacement, true); assert.equal(p.cells[2], 'WHITE');
});
test('saved projects reject corruption and unknown palette references', () => {
  assert.throws(() => E.validate(project(['RED'], 2, 2)), /网格/);
  assert.throws(() => E.validate(project(['UNKNOWN'], 1, 1)), /未知/);
  assert.throws(() => E.validate(project(['RED'], 129, 1)), /尺寸/);
  const p = project(['RED'], 1, 1); assert.deepEqual(E.validate(JSON.parse(JSON.stringify(p))), p);
});
test('all export tiles cover each grid cell exactly once, with readable bounded canvases', () => {
  for (const [width, height] of [[48, 48], [64, 96], [128, 128], [17, 1], [32, 128]]) {
    const p = project(Array(width * height).fill('RED'), width, height), seen = new Uint8Array(width * height);
    const pages = R.exportPlan(p, 'grid');
    pages.forEach(page => {
      assert.ok(page.width <= 2048 && page.height <= 2048);
      if (page.kind !== 'grid') return;
      for (let y = page.fromY; y < page.fromY + page.rows; y++) for (let x = page.fromX; x < page.fromX + page.cols; x++) seen[y * width + x]++;
    });
    assert.ok(seen.every(n => n === 1)); assert.equal(pages.filter(p => p.kind === 'legend').length, 1);
  }
});
test('export renders absolute coordinates and distinguishes empty cells', () => {
  const calls = [], ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: () => true });
  const p = project(Array(64 * 64).fill(null), 64, 64); p.cells[0] = 'RED';
  const pages = R.exportPlan(p, 'grid'); R.exportPage(ctx, p, pages[3], 3, pages.length);
  const texts = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
  assert.ok(texts.includes('49')); assert.ok(texts.includes('64')); assert.ok(texts.includes('·')); assert.ok(texts.some(t => /列 49–64 \/ 行 49–64/.test(t)));
});
test('material CSV quantities equal nonempty grid count and use UTF-8 BOM', () => {
  const p = project(['RED', 'RED', null, 'BLACK'], 2, 2), csv = E.csv(p);
  assert.ok(csv.startsWith('\uFEFF')); assert.match(csv, /RED,#ff0000,2/); assert.match(csv, /BLACK,#000000,1/); assert.ok(!csv.includes('null'));
});
