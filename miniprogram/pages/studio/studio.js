const E = require('../../core/engine');
const R = require('../../core/render');
const Demo = require('../../core/demo');
const Palette = require('../../data/palette');
const Storage = require('../../utils/storage');
const api = (name, args) => new Promise((resolve, reject) => wx[name](Object.assign({}, args, { success: resolve, fail: reject })));
const hints = { move: '拖动画布查看细节，双指可缩放', paint: '选择颜色后涂画，放大后操作更准确', erase: '擦除格子后，这里就不需要放豆子', pick: '点击图纸格子，拾取它的色号', replace: '点击图纸中的颜色，全部替换成当前画笔色' };

Page({
  data: {
    tab: 'make', title: '林间小兔', viewMode: 'beads', hasSource: false, busy: false, dirty: false,
    width: 48, widths: [32, 48, 64, 96, 128], gridWidth: 48, gridHeight: 48,
    colorOptions: [8, 12, 16, 24, 36, 48, 96, 220], colorIndex: 3,
    ratioOptions: ['跟随原图', '正方形 1:1', '横向 4:3', '竖向 3:4'], ratioIndex: 0,
    sampling: 'average', background: 'transparent', denoise: false, fit: 'contain', cropZoom: 1, offsetX: 0, offsetY: 0, rotation: 0,
    advanced: false, settingsChanged: false, total: 0, colorCount: 0, stats: [], zoomLabel: 100,
    tool: 'move', toolHint: hints.move,
    tools: [{ id: 'move', icon: '✥', name: '移动' }, { id: 'paint', icon: '✎', name: '画笔' }, { id: 'erase', icon: '◇', name: '擦除' }, { id: 'pick', icon: '⌖', name: '取色' }, { id: 'replace', icon: '⇄', name: '替色' }],
    canUndo: false, canRedo: false, selectedColor: 'H7', selectedHex: '#000000', paletteOpen: false, colorSearch: '', paletteColors: Palette.colors, projects: []
  },
  onReady() {
    this.history = []; this.future = []; this.view = { zoom: 1, panX: 0, panY: 0 };
    const query = wx.createSelectorQuery().in(this);
    query.select('#board').fields({ node: true, size: true });
    query.select('#processCanvas').fields({ node: true, size: true });
    query.select('#exportCanvas').fields({ node: true, size: true });
    query.exec(async results => {
      try {
        if (results.some(r => !r || !r.node)) throw Error('当前微信版本不支持 Canvas 2D，请升级微信');
        this.board = results[0].node; this.boardWidth = results[0].width; this.boardHeight = results[0].height;
        this.processCanvas = results[1].node; this.exportCanvas = results[2].node;
        const dpr = Math.min((wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio, 3);
        this.board.width = this.boardWidth * dpr; this.board.height = this.boardHeight * dpr;
        this.ctx = this.board.getContext('2d'); this.ctx.scale(dpr, dpr);
        await this.loadDemo(); this.refreshLibrary();
      } catch (error) { this.fail(error); }
    });
  },
  onUnload() { this.unloaded = true; },
  fail(error) {
    if (this.unloaded) return;
    const message = error && (error.message || error.errMsg) || '操作失败，请重试';
    if (/cancel/i.test(message)) return;
    wx.showModal({ title: '这一步没完成', content: /auth|deny|denied|privacy/i.test(message) ? '请在微信的小程序设置中允许所需权限后重试。开发者还需在小程序后台配置隐私保护指引。' : message, showCancel: false });
  },
  async confirmDiscard() {
    if (!this.data.dirty) return true;
    const result = await api('showModal', { title: '当前作品还没有保存', content: '继续会替换当前画布。想保留编辑，请先取消并保存作品。', confirmText: '继续替换' });
    return result.confirm;
  },
  async privacy() { if (wx.requirePrivacyAuthorize) await api('requirePrivacyAuthorize'); },
  async chooseImage() {
    if (this.data.busy || !this.processCanvas) return;
    try {
      if (!await this.confirmDiscard()) return;
      await this.privacy();
      const result = await api('chooseMedia', { count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['original'] });
      const file = result.tempFiles[0];
      if (file.size > 20 * 1024 * 1024) throw Error('图片超过 20 MB，请先缩小图片');
      this.setData({ busy: true });
      const info = await api('getImageInfo', { src: file.tempFilePath });
      if (info.width * info.height > 40000000) throw Error('图片像素过大，请选择 4000 万像素以内的图片');
      const image = await this.loadImage(file.tempFilePath);
      this.sourceImage = image;
      this.setData({ title: '我的拼豆作品', hasSource: true, rotation: 0, cropZoom: 1, offsetX: 0, offsetY: 0, tab: 'make', viewMode: 'original', settingsChanged: true, busy: false });
      this.draw();
    } catch (error) { this.setData({ busy: false }); this.fail(error); }
  },
  loadImage(path) {
    return new Promise((resolve, reject) => {
      const image = this.processCanvas.createImage(); image.onload = () => resolve(image); image.onerror = () => reject(Error('图片解码失败，请换一张 JPG 或 PNG 图片')); image.src = path;
    });
  },
  async useDemo() { if (this.data.busy || !this.processCanvas) return; if (await this.confirmDiscard()) await this.loadDemo(); },
  async loadDemo() {
    this.setData({ busy: true });
    try {
      const canvas = this.processCanvas; canvas.width = 320; canvas.height = 320; Demo.draw(canvas.getContext('2d'), 320);
      const file = await api('canvasToTempFilePath', { canvas, width: 320, height: 320, destWidth: 320, destHeight: 320, fileType: 'png' });
      this.sourceImage = await this.loadImage(file.tempFilePath);
      this.setData({ title: '林间小兔', hasSource: true, cropZoom: 1, offsetX: 0, offsetY: 0, rotation: 0, tab: 'make', ratioIndex: 0 });
      await this.convert(false); this.setData({ dirty: false });
    } catch (error) { this.fail(error); }
    finally { this.setData({ busy: false }); }
  },
  options() {
    return { maxColors: this.data.colorOptions[this.data.colorIndex], sampling: this.data.sampling, background: this.data.background, denoise: this.data.denoise, fit: this.data.fit, rotation: this.data.rotation, cropZoom: this.data.cropZoom, offsetX: this.data.offsetX / 100, offsetY: this.data.offsetY / 100, ratioIndex: this.data.ratioIndex };
  },
  target() {
    if (!this.sourceImage) return { width: this.data.width, height: this.data.width };
    const image = this.sourceImage, rotated = this.data.rotation % 180 !== 0;
    const ratio = [rotated ? image.height / image.width : image.width / image.height, 1, 4 / 3, 3 / 4][this.data.ratioIndex];
    return E.dimensions(this.data.width, ratio);
  },
  async generate() {
    if (this.data.busy || !this.sourceImage) return;
    try {
      if (!await this.confirmDiscard()) return;
      this.setData({ busy: true }); await this.convert(true);
      wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (error) { this.fail(error); }
    finally { this.setData({ busy: false }); }
  },
  async convert(toEditor) {
    await new Promise(resolve => setTimeout(resolve, 40));
    const { width, height } = this.target(), opts = this.options();
    // Four samples per dimension give alpha-aware area averaging with bounded RAM.
    const canvas = this.processCanvas; canvas.width = width * 4; canvas.height = height * 4;
    const ctx = canvas.getContext('2d'); R.source(ctx, this.sourceImage, canvas.width, canvas.height, opts);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const samples = E.sample(data, canvas.width, canvas.height, width, height, opts);
    const project = E.quantize(samples, width, height, Palette, opts); project.title = this.data.title;
    this.project = project; this.history = []; this.future = []; this.view = { zoom: 1, panX: 0, panY: 0 };
    this.setData({ settingsChanged: false, dirty: true, viewMode: 'beads', tab: toEditor ? 'edit' : 'make', zoomLabel: 100, canUndo: false, canRedo: false });
    this.updateProject();
  },
  draw() {
    if (!this.ctx || this.data.tab === 'library') return;
    if (this.data.viewMode === 'original' && this.sourceImage) {
      const { width, height } = this.target(), opts = this.options();
      const canvas = this.processCanvas; canvas.width = width * 4; canvas.height = height * 4;
      R.source(canvas.getContext('2d'), this.sourceImage, canvas.width, canvas.height, opts);
      const w = this.boardWidth, h = this.boardHeight, scale = Math.min((w - 32) / width, (h - 32) / height);
      R.checker(this.ctx, w, h, 12); this.ctx.drawImage(canvas, (w - width * scale) / 2, (h - height * scale) / 2, width * scale, height * scale); return;
    }
    if (this.project) this.geometry = R.viewport(this.ctx, this.project, this.boardWidth, this.boardHeight, Object.assign({}, this.view, { mode: this.data.viewMode }));
  },
  updateProject() {
    if (!this.project) return;
    const stats = E.statistics(this.project);
    this.setData({ title: this.project.title, stats, total: stats.reduce((n, c) => n + c.count, 0), colorCount: stats.length, gridWidth: this.project.width, gridHeight: this.project.height, canUndo: !!this.history.length, canRedo: !!this.future.length });
    this.draw();
  },
  markSettings(fields) { this.setData(Object.assign({ settingsChanged: true }, fields)); if (this.data.viewMode === 'original') this.draw(); },
  selectWidth(e) { this.markSettings({ width: Number(e.currentTarget.dataset.width) }); },
  slideWidth(e) { this.markSettings({ width: e.detail.value }); },
  selectColors(e) { this.markSettings({ colorIndex: Number(e.detail.value) }); },
  selectRatio(e) { this.markSettings({ ratioIndex: Number(e.detail.value), viewMode: this.sourceImage ? 'original' : this.data.viewMode }); },
  selectFit(e) { this.markSettings({ fit: e.currentTarget.dataset.fit, viewMode: 'original' }); },
  cropSlider(e) { this.markSettings({ [e.currentTarget.dataset.field]: e.detail.value, viewMode: 'original' }); },
  rotate() { this.markSettings({ rotation: (this.data.rotation + 90) % 360, viewMode: 'original' }); },
  toggleSampling(e) { this.markSettings({ sampling: e.detail.value ? 'nearest' : 'average' }); },
  toggleBackground(e) { this.markSettings({ background: e.detail.value ? 'transparent' : 'white' }); },
  toggleDenoise(e) { this.markSettings({ denoise: e.detail.value }); },
  toggleAdvanced() { this.setData({ advanced: !this.data.advanced }); },
  changeView(e) { this.setData({ viewMode: e.currentTarget.dataset.mode }); this.draw(); },
  zoom(factor) { if (!this.view || this.data.viewMode === 'original') return; this.view.zoom = Math.max(.5, Math.min(12, this.view.zoom * factor)); this.setData({ zoomLabel: Math.round(this.view.zoom * 100) }); this.draw(); },
  zoomIn() { this.zoom(1.4); }, zoomOut() { this.zoom(1 / 1.4); },
  resetView() { this.view = { zoom: 1, panX: 0, panY: 0 }; this.setData({ zoomLabel: 100 }); this.draw(); },
  setTool(e) { const tool = e.currentTarget.dataset.tool; this.setData({ tool, toolHint: hints[tool], viewMode: 'grid' }); this.draw(); },
  point(t) { return { x: t.x, y: t.y }; },
  touchStart(e) {
    if (!this.project || this.data.busy || this.data.viewMode === 'original') return;
    if (e.touches.length > 1) { this.finishStroke(); this.pinch = this.touchDistance(e.touches); this.lastTouch = null; return; }
    const p = this.point(e.touches[0]); this.lastTouch = p; this.stroke = []; this.lastCell = null;
    if (this.data.tab === 'edit' && this.data.tool !== 'move') this.paintAt(p);
  },
  touchDistance(touches) { const a = this.point(touches[0]), b = this.point(touches[1]); return Math.hypot(a.x - b.x, a.y - b.y); },
  touchMove(e) {
    if (!this.project || this.data.busy || this.data.viewMode === 'original') return;
    if (e.touches.length > 1) {
      this.finishStroke(); const distance = this.touchDistance(e.touches);
      if (this.pinch > 0) this.zoom(distance / this.pinch); this.pinch = distance; this.lastTouch = null; return;
    }
    if (this.pinch) return;
    const p = this.point(e.touches[0]);
    if ((this.data.tool === 'move' || this.data.tab !== 'edit') && this.lastTouch) { this.view.panX += p.x - this.lastTouch.x; this.view.panY += p.y - this.lastTouch.y; this.draw(); }
    else if (['paint', 'erase'].includes(this.data.tool)) this.paintAt(p);
    this.lastTouch = p;
  },
  touchEnd() { this.finishStroke(); this.pinch = null; this.lastTouch = null; },
  paintAt(p) {
    const g = this.geometry; if (!g) return;
    const x = Math.floor((p.x - g.x) / g.cell), y = Math.floor((p.y - g.y) / g.cell);
    if (x < 0 || y < 0 || x >= this.project.width || y >= this.project.height) { this.lastCell = null; return; }
    const index = y * this.project.width + x, code = this.project.cells[index], tool = this.data.tool;
    if (tool === 'pick') { if (code) { this.setColor(code); this.setData({ tool: 'paint', toolHint: hints.paint }); } return; }
    if (tool === 'replace') { if (code && code !== this.data.selectedColor) this.commit(E.replaceColor(this.project, code, this.data.selectedColor)); return; }
    const next = tool === 'erase' ? null : this.data.selectedColor;
    const points = this.lastCell ? E.line(this.lastCell.x, this.lastCell.y, x, y) : [[x, y]];
    const patch = E.changeCells(this.project, points.map(([cx, cy]) => ({ index: cy * this.project.width + cx, code: next })));
    this.stroke = (this.stroke || []).concat(patch); this.lastCell = { x, y }; this.draw();
  },
  finishStroke() {
    if (this.stroke && this.stroke.length) {
      const changes = new Map(); this.stroke.forEach(p => { if (changes.has(p.index)) changes.get(p.index).after = p.after; else changes.set(p.index, Object.assign({}, p)); });
      this.commit(Array.from(changes.values()));
    }
    this.stroke = []; this.lastCell = null;
  },
  commit(patch) { if (!patch.length) return; this.history.push(patch); if (this.history.length > 60) this.history.shift(); this.future = []; this.setData({ dirty: true }); this.updateProject(); },
  undo() { const patch = this.history.pop(); if (!patch) return; E.replay(this.project, patch, true); this.future.push(patch); this.setData({ dirty: true }); this.updateProject(); },
  redo() { const patch = this.future.pop(); if (!patch) return; E.replay(this.project, patch, false); this.history.push(patch); this.setData({ dirty: true }); this.updateProject(); },
  setColor(code) { const color = this.project.palette.colors.find(c => c.code === code); if (color) this.setData({ selectedColor: code, selectedHex: color.hex }); },
  selectColor(e) { this.setColor(e.currentTarget.dataset.code); },
  openPalette() { this.setData({ paletteOpen: true, colorSearch: '', paletteColors: this.project.palette.colors }); },
  closePalette() { this.setData({ paletteOpen: false }); },
  searchColor(e) { const value = e.detail.value; this.setData({ colorSearch: value, paletteColors: this.project.palette.colors.filter(c => c.code.toLowerCase().includes(value.trim().toLowerCase())) }); },
  noop() {},
  async rename() {
    const result = await api('showModal', { title: '给作品起个名字', editable: true, placeholderText: this.project.title });
    if (result.confirm && result.content.trim()) { this.project.title = result.content.trim().slice(0, 40); this.setData({ title: this.project.title, dirty: true }); }
  },
  save() { if (!this.project) return; try { this.project = Storage.save(this.project); this.setData({ dirty: false }); this.refreshLibrary(); wx.showToast({ title: '已保存到我的作品', icon: 'success' }); } catch (error) { this.fail(error); } },
  refreshLibrary() { this.setData({ projects: Storage.list().map(p => Object.assign({}, p, { dateLabel: new Date(p.updatedAt).toLocaleDateString() })) }); },
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (this.data.busy) return;
    if (tab === 'edit' && !this.project) return;
    this.setData({ tab, viewMode: tab === 'edit' && this.data.viewMode === 'original' ? 'grid' : this.data.viewMode }, () => this.draw());
    if (tab === 'library') this.refreshLibrary(); wx.pageScrollTo({ scrollTop: 0, duration: 200 });
  },
  async openProject(e) {
    try {
      if (!await this.confirmDiscard()) return;
      this.project = Storage.load(e.currentTarget.dataset.id); this.sourceImage = null; this.history = []; this.future = []; this.view = { zoom: 1, panX: 0, panY: 0 };
      this.setData({ tab: 'edit', viewMode: 'grid', hasSource: false, dirty: false, settingsChanged: false, zoomLabel: 100, tool: 'move', toolHint: hints.move });
      this.setColor(this.project.palette.colors[0].code); this.updateProject(); wx.pageScrollTo({ scrollTop: 0, duration: 200 });
    } catch (error) { this.fail(error); }
  },
  async deleteProject(e) {
    const id = e.currentTarget.dataset.id;
    const result = await api('showModal', { title: '删除这份本地作品？', content: '删除后无法从作品库恢复，已导出的图片不受影响。', confirmText: '删除', confirmColor: '#ad6555' });
    if (result.confirm) { try { Storage.remove(id); if (this.project && this.project.id === id) { delete this.project.id; this.setData({ dirty: true }); } this.refreshLibrary(); } catch (error) { this.fail(error); } }
  },
  copyList() { if (this.project) wx.setClipboardData({ data: this.project.title + '\nMARD 用豆清单\n' + E.statistics(this.project).map(c => c.code + '：' + c.count + ' 颗').join('\n') + '\n合计 ' + this.data.total + ' 颗（不含空格）' }); },
  async exportPattern() {
    if (!this.project || this.data.busy) return;
    try {
      const choice = await api('showActionSheet', { itemList: ['拼豆效果图', '施工图 + 用豆清单（自动分块）'] });
      this.setData({ busy: true }); const pages = R.exportPlan(this.project, choice.tapIndex === 0 ? 'effect' : 'grid'), paths = [];
      for (let i = 0; i < pages.length; i++) {
        wx.showLoading({ title: '导出 ' + (i + 1) + '/' + pages.length, mask: true });
        const page = pages[i], canvas = this.exportCanvas; canvas.width = page.width; canvas.height = page.height;
        R.exportPage(canvas.getContext('2d'), this.project, page, i, pages.length);
        const result = await api('canvasToTempFilePath', { canvas, width: page.width, height: page.height, destWidth: page.width, destHeight: page.height, fileType: 'png' }); paths.push(result.tempFilePath);
      }
      wx.hideLoading();
      await api('showModal', { title: '已生成 ' + paths.length + ' 张图片', content: '接下来可左右滑动查看，长按图片即可保存。施工图按行、列编号拼接，最后附用豆清单。', showCancel: false, confirmText: '查看图纸' });
      await api('previewImage', { urls: paths, current: paths[0] });
    } catch (error) { wx.hideLoading(); this.fail(error); }
    finally { this.setData({ busy: false }); }
  }
});
