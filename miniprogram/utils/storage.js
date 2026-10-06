const Engine = require('../core/engine');
const INDEX = 'douyu-projects-v1';
const fs = () => wx.getFileSystemManager();
const base = () => wx.env.USER_DATA_PATH + '/douyu';
function init() { try { fs().accessSync(base()); } catch (_) { fs().mkdirSync(base(), true); } }
function list() {
  const items = wx.getStorageSync(INDEX);
  return Array.isArray(items) ? items.filter(p => p && /^p[\w-]+$/.test(p.id)).sort((a, b) => b.updatedAt - a.updatedAt) : [];
}
function save(project) {
  Engine.validate(project); init();
  const id = project.id && /^p[\w-]+$/.test(project.id) ? project.id : 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const now = Date.now(), filename = id + '-' + now + '-' + Math.random().toString(36).slice(2, 6) + '.json';
  const copy = Object.assign({}, project, { id, updatedAt: now });
  const items = list(), old = items.find(p => p.id === id), stats = Engine.statistics(copy);
  const item = { id, filename, title: copy.title, width: copy.width, height: copy.height, updatedAt: now, total: stats.reduce((n, c) => n + c.count, 0), colors: stats.slice(0, 6).map(c => c.hex) };
  fs().writeFileSync(base() + '/' + filename, JSON.stringify(copy), 'utf8');
  try { wx.setStorageSync(INDEX, [item].concat(items.filter(p => p.id !== id))); }
  catch (error) { try { fs().unlinkSync(base() + '/' + filename); } catch (_) {} throw error; }
  if (old && /^[\w-]+\.json$/.test(old.filename)) { try { fs().unlinkSync(base() + '/' + old.filename); } catch (_) {} }
  return copy;
}
function load(id) {
  const item = list().find(p => p.id === id);
  if (!item || !/^[\w-]+\.json$/.test(item.filename)) throw Error('找不到这份作品');
  return Engine.validate(JSON.parse(fs().readFileSync(base() + '/' + item.filename, 'utf8')));
}
function remove(id) {
  const items = list(), item = items.find(p => p.id === id);
  wx.setStorageSync(INDEX, items.filter(p => p.id !== id));
  if (item && /^[\w-]+\.json$/.test(item.filename)) { try { fs().unlinkSync(base() + '/' + item.filename); } catch (_) {} }
}
module.exports = { list, save, load, remove };
