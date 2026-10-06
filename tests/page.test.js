const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../miniprogram/core/engine');
const palette = require('../miniprogram/data/palette');
let definition;
global.Page = p => { definition = p; };
require('../miniprogram/pages/studio/studio');
function page() {
  const p = Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)) });
  p.setData = (data, callback) => { Object.assign(p.data, data); if (callback) callback(); };
  p.draw = () => {};
  p.project = E.quantize(Array(16).fill([0, 0, 0]), 4, 4, palette, {});
  p.history = []; p.future = []; p.view = { zoom: 1, panX: 0, panY: 0 }; p.geometry = { x: 0, y: 0, cell: 20 };
  p.setData({ tab: 'edit', tool: 'erase', viewMode: 'grid' }); return p;
}
test('native page groups a continuous stroke as one undoable edit', () => {
  const p = page();
  p.touchStart({ touches: [{ x: 10, y: 10 }] }); p.touchMove({ touches: [{ x: 70, y: 10 }] }); p.touchEnd();
  assert.equal(p.history.length, 1); assert.equal(p.data.total, 12); assert.equal(p.data.dirty, true);
  p.undo(); assert.equal(p.data.total, 16); assert.equal(p.data.canRedo, true);
  p.redo(); assert.equal(p.data.total, 12);
});
test('native move tool pans without editing data', () => {
  const p = page(); p.data.tool = 'move'; p.touchStart({ touches: [{ x: 10, y: 10 }] }); p.touchMove({ touches: [{ x: 40, y: 50 }] }); p.touchEnd();
  assert.deepEqual(p.view, { zoom: 1, panX: 30, panY: 40 }); assert.equal(p.history.length, 0); assert.equal(E.statistics(p.project)[0].count, 16);
});
test('native erase outside grid is a no-op and cannot wrap to another row', () => {
  const p = page(); p.touchStart({ touches: [{ x: -1, y: 10 }] }); p.touchEnd();
  assert.equal(p.history.length, 0); assert.equal(E.statistics(p.project)[0].count, 16);
});
test('native color replacement updates all occurrences in one action', () => {
  const p = page(); p.data.tool = 'replace'; p.data.selectedColor = 'H2';
  p.touchStart({ touches: [{ x: 10, y: 10 }] }); p.touchEnd();
  assert.ok(p.project.cells.every(c => c === 'H2')); assert.equal(p.history.length, 1); assert.equal(p.data.total, 16);
  p.undo(); assert.ok(p.project.cells.every(c => c === 'H7'));
});
test('native pinch finishes current stroke and only adjusts zoom', () => {
  const p = page(); p.touchStart({ touches: [{ x: 10, y: 10 }] });
  p.touchStart({ touches: [{ x: 10, y: 10 }, { x: 30, y: 10 }] });
  p.touchMove({ touches: [{ x: 10, y: 10 }, { x: 50, y: 10 }] }); p.touchEnd();
  assert.equal(p.view.zoom, 2); assert.equal(p.data.total, 15); assert.equal(p.history.length, 1);
});
