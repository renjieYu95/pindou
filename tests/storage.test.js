const test = require('node:test');
const assert = require('node:assert/strict');
const Storage = require('../miniprogram/utils/storage');
const palette = require('../miniprogram/data/palette');
function harness() {
  const files = new Map(), values = new Map(); let failIndex = false, failWrite = false;
  global.wx = {
    env: { USER_DATA_PATH: '/sandbox' },
    getStorageSync: key => values.get(key),
    setStorageSync: (key, value) => { if (failIndex) throw Error('storage full'); values.set(key, value); },
    getFileSystemManager: () => ({ accessSync() {}, mkdirSync() {}, writeFileSync(path, data) { if (failWrite) throw Error('disk full'); files.set(path, data); }, readFileSync(path) { if (!files.has(path)) throw Error('not found'); return files.get(path); }, unlinkSync(path) { files.delete(path); } })
  };
  return { files, values, failIndex: value => { failIndex = value; }, failWrite: value => { failWrite = value; } };
}
function project() { return { version: 1, title: '测试兔子', width: 2, height: 2, cells: ['H7', null, 'H2', 'H7'], palette }; }
test('local save/load preserves empty cells, title, palette and grid', () => {
  const h = harness(), saved = Storage.save(project()), loaded = Storage.load(saved.id);
  assert.deepEqual(loaded, saved); assert.equal(Storage.list()[0].total, 3); assert.equal(h.files.size, 1);
});
test('overwriting a project atomically replaces file and cleans previous version', () => {
  const h = harness(), p = Storage.save(project()); p.title = '重命名'; p.cells[0] = null;
  Storage.save(p); assert.equal(Storage.list().length, 1); assert.equal(Storage.load(p.id).title, '重命名'); assert.equal(h.files.size, 1);
});
test('failed index update preserves previous project, removes orphan new file', () => {
  const h = harness(), p = Storage.save(project()); p.title = '不能写入'; h.failIndex(true);
  assert.throws(() => Storage.save(p), /storage full/); assert.equal(Storage.load(p.id).title, '测试兔子'); assert.equal(h.files.size, 1);
});
test('failed disk write does not change index or existing project', () => {
  const h = harness(), p = Storage.save(project()); h.failWrite(true); p.cells[0] = null;
  assert.throws(() => Storage.save(p), /disk full/); assert.equal(Storage.load(p.id).cells[0], 'H7'); assert.equal(h.files.size, 1);
});
test('deletion clears index and its file, and missing project errors clearly', () => {
  const h = harness(), p = Storage.save(project()); Storage.remove(p.id);
  assert.deepEqual(Storage.list(), []); assert.equal(h.files.size, 0); assert.throws(() => Storage.load(p.id), /找不到/);
});
