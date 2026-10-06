/* Browser companion: conversion, drawing, editing and exports use the mini-program core. */
(() => {
  'use strict';
  const E = window.BeadEngine, R = window.BeadRender, palette = window.BeadPalette;
  const $ = id => document.getElementById(id), board = $('board'), ctx = board.getContext('2d');
  const scratch = document.createElement('canvas');
  const state = { project: null, image: null, mode: 'beads', tool: 'move', rotation: 0, selected: 'H7', zoom: 1, panX: 0, panY: 0, history: [], future: [], dirty: false, busy: false, stroke: [], lastCell: null };
  const KEY = 'douyu-browser-projects-v1';
  let toastTimer, geometry, cssWidth, cssHeight, pointer, strokeMap, exportUrls = [];
  function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
  function options() { return { maxColors: Number($('maxColors').value), sampling: $('nearest').checked ? 'nearest' : 'average', background: $('transparent').checked ? 'transparent' : 'white', denoise: $('denoise').checked, fit: $('fit').value, rotation: state.rotation, cropZoom: Number($('cropZoom').value), offsetX: Number($('offsetX').value) / 100, offsetY: Number($('offsetY').value) / 100 }; }
  function target() { const image = state.image, rotated = state.rotation % 180 !== 0; const ratio = [image ? (rotated ? image.height / image.width : image.width / image.height) : 1, 1, 4 / 3, 3 / 4][Number($('ratio').value)]; return E.dimensions(Number($('width').value), ratio); }
  function changed() { $('generationHint').textContent = '参数已修改，点击生成应用到图纸'; $('widthValue').textContent = $('width').value + ' 颗'; $('cropZoomValue').textContent = $('cropZoom').value + '×'; document.querySelectorAll('#sizes button').forEach(b => b.classList.toggle('active', b.dataset.width === $('width').value)); if (state.mode === 'original') draw(); }
  function setMode(mode) { if (mode === 'original' && !state.image) return toast('这份已保存作品不含原图，请先导入图片'); state.mode = mode; document.querySelectorAll('#viewModes button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode)); $('canvasTag').textContent = mode === 'original' ? '裁剪预览' : 'MARD 参考色卡'; draw(); }
  function resize() { const rect = board.getBoundingClientRect(); if (!rect.width || !rect.height) return; cssWidth = rect.width; cssHeight = rect.height; const dpr = Math.min(window.devicePixelRatio || 1, 3); board.width = Math.round(cssWidth * dpr); board.height = Math.round(cssHeight * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  function draw() {
    if (!cssWidth) return;
    if (state.mode === 'original' && state.image) {
      const t = target(); scratch.width = t.width * 4; scratch.height = t.height * 4; R.source(scratch.getContext('2d'), state.image, scratch.width, scratch.height, options());
      R.checker(ctx, cssWidth, cssHeight, 12); const cell = Math.min((cssWidth - 32) / t.width, (cssHeight - 32) / t.height);
      ctx.drawImage(scratch, (cssWidth - t.width * cell) / 2, (cssHeight - t.height * cell) / 2, t.width * cell, t.height * cell); return;
    }
    if (state.project) geometry = R.viewport(ctx, state.project, cssWidth, cssHeight, state);
  }
  function swatch(c, count) {
    const b = document.createElement('button'); b.className = 'swatch' + (c.code === state.selected ? ' active' : ''); b.dataset.code = c.code; b.title = c.code + ' · ' + c.hex;
    const color = document.createElement('i'); color.style.background = c.hex; const code = document.createElement('strong'); code.textContent = c.code; b.append(color, code);
    if (count !== undefined) { const n = document.createElement('small'); n.textContent = count + ' 颗'; b.append(n); }
    b.onclick = () => selectColor(c.code); return b;
  }
  function selectColor(code) { state.selected = code; updateSelected(); }
  function updateSelected() {
    const colors = state.project ? state.project.palette.colors : palette.colors, c = colors.find(c => c.code === state.selected) || colors[0]; state.selected = c.code;
    $('selectedCode').textContent = c.code; $('selectedSwatch').style.background = c.hex;
    document.querySelectorAll('.swatch').forEach(b => b.classList.toggle('active', b.dataset.code === c.code));
  }
  function update() {
    const p = state.project; if (!p) return;
    $('generate').disabled = !state.image || state.busy;
    const stats = E.statistics(p); $('total').textContent = stats.reduce((sum, c) => sum + c.count, 0).toLocaleString(); $('colors').textContent = stats.length;
    $('dimensions').innerHTML = p.width + ' <em>×</em> ' + p.height; $('canvasDim').textContent = p.width + ' × ' + p.height + ' 格'; $('pages').textContent = Math.ceil(p.width / 48) * Math.ceil(p.height / 48);
    $('paletteCount').textContent = stats.length + ' COLORS'; $('swatches').replaceChildren(...stats.map(c => swatch(c, c.count)));
    $('undo').disabled = !state.history.length; $('redo').disabled = !state.future.length; $('unsaved').hidden = !state.dirty; updateSelected(); draw();
  }
  function discard() { return !state.dirty || window.confirm('当前作品还没有保存。继续会替换画布，是否继续？'); }
  async function generate(confirm = true) {
    if (state.busy || !state.image) return;
    if (confirm && !discard()) return;
    state.busy = true; $('generate').disabled = true; $('generate').textContent = '正在生成图纸…';
    try {
      await new Promise(resolve => setTimeout(resolve, 30));
      const { width, height } = target(), opts = options(); scratch.width = width * 4; scratch.height = height * 4;
      const sc = scratch.getContext('2d', { willReadFrequently: true }); R.source(sc, state.image, scratch.width, scratch.height, opts);
      const samples = E.sample(sc.getImageData(0, 0, scratch.width, scratch.height).data, scratch.width, scratch.height, width, height, opts);
      const project = E.quantize(samples, width, height, palette, opts); project.title = state.sourceTitle || '我的拼豆作品';
      state.project = project; state.history = []; state.future = []; state.dirty = true; resetView(); setMode('beads'); update(); $('generationHint').textContent = '图纸已生成，可以用画笔微调或直接导出';
      if (confirm) toast('图纸已生成，开始你的拼豆创作吧');
    } catch (error) { toast(error.message); }
    finally { state.busy = false; $('generate').disabled = false; $('generate').innerHTML = '生成我的拼豆图纸 <span>↗</span>'; }
  }
  async function demo(initial = false) {
    if (state.busy || (!initial && !discard())) return;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 320; window.BeadDemo.draw(canvas.getContext('2d'), 320); state.image = canvas; state.sourceTitle = '林间小兔'; resetCrop(); await generate(false);
    if (initial) { state.dirty = false; update(); }
  }
  function resetCrop() { state.rotation = 0; $('cropZoom').value = 1; $('offsetX').value = $('offsetY').value = 0; $('ratio').value = 0; changed(); }
  async function importFile(file) {
    if (!file || state.busy) return;
    if (file.size > 20 * 1024 * 1024) return toast('请选择 20 MB 以内的图片');
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('支持 JPG、PNG 或 WebP 图片');
    if (!discard()) return;
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth * image.naturalHeight > 40000000) throw Error('请选择 4000 万像素以内的图片');
      state.image = image; state.sourceTitle = file.name.replace(/\.[^.]+$/, '').slice(0, 40) || '我的拼豆作品'; $('generate').disabled = false; resetCrop(); setMode('original'); toast('图片已导入，调整设置后点击生成');
    } catch (error) { toast(error.message || '图片读取失败'); }
    finally { URL.revokeObjectURL(url); }
  }
  function zoom(factor) { if (state.mode === 'original') return; state.zoom = Math.max(.5, Math.min(12, state.zoom * factor)); $('resetZoom').textContent = Math.round(state.zoom * 100) + '%'; draw(); }
  function resetView() { state.zoom = 1; state.panX = state.panY = 0; $('resetZoom').textContent = '100%'; draw(); }
  function tool(name) { state.tool = name; document.querySelectorAll('#tools button').forEach(b => b.classList.toggle('active', b.dataset.tool === name)); const hints = { move: '滚轮缩放，拖动画布查看细节。', paint: '选择颜色后在画布上涂画，放大后操作更准确。', erase: '擦除格子后，这里就不需要放豆子。', pick: '点击图纸格子拾取色号，随后可直接涂画。', replace: '点击画布中的颜色，将该颜色全部替换成当前画笔色。' }; $('toolHelp').textContent = hints[name]; if (name !== 'move') setMode('grid'); board.style.cursor = name === 'move' ? 'grab' : 'crosshair'; }
  function commit(patch) { if (!patch.length) return; state.history.push(patch); if (state.history.length > 60) state.history.shift(); state.future = []; state.dirty = true; update(); }
  function paint(p) {
    if (!geometry || !state.project) return;
    const x = Math.floor((p.x - geometry.x) / geometry.cell), y = Math.floor((p.y - geometry.y) / geometry.cell), pr = state.project;
    if (x < 0 || y < 0 || x >= pr.width || y >= pr.height) { state.lastCell = null; return; }
    const index = y * pr.width + x, current = pr.cells[index];
    if (state.tool === 'pick') { if (current) { selectColor(current); tool('paint'); pointer = null; } return; }
    if (state.tool === 'replace') { if (current) commit(E.replaceColor(pr, current, state.selected)); pointer = null; return; }
    const code = state.tool === 'erase' ? null : state.selected, points = state.lastCell ? E.line(state.lastCell.x, state.lastCell.y, x, y) : [[x, y]];
    E.changeCells(pr, points.map(([px, py]) => ({ index: py * pr.width + px, code }))).forEach(patch => { if (strokeMap.has(patch.index)) strokeMap.get(patch.index).after = patch.after; else strokeMap.set(patch.index, patch); });
    state.lastCell = { x, y }; draw();
  }
  function position(e) { const rect = board.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top }; }
  board.addEventListener('pointerdown', e => { if (state.mode === 'original' || state.busy || !state.project) return; board.setPointerCapture(e.pointerId); pointer = position(e); strokeMap = new Map(); state.lastCell = null; if (state.tool !== 'move') paint(pointer); });
  board.addEventListener('pointermove', e => { if (!pointer) return; const p = position(e); if (state.tool === 'move') { state.panX += p.x - pointer.x; state.panY += p.y - pointer.y; draw(); } else if (['paint', 'erase'].includes(state.tool)) paint(p); pointer = p; });
  function endStroke() { if (strokeMap && strokeMap.size) commit(Array.from(strokeMap.values())); strokeMap = null; pointer = null; state.lastCell = null; }
  board.addEventListener('pointerup', endStroke); board.addEventListener('pointercancel', endStroke); board.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
  function undo() { const patch = state.history.pop(); if (patch) { E.replay(state.project, patch, true); state.future.push(patch); state.dirty = true; update(); } }
  function redo() { const patch = state.future.pop(); if (patch) { E.replay(state.project, patch, false); state.history.push(patch); state.dirty = true; update(); } }
  function projects() { try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; } catch (_) { return []; } }
  function refreshLibrary() {
    const list = projects().sort((a, b) => b.updatedAt - a.updatedAt); $('savedCount').textContent = list.length;
    const container = $('projectList'); container.replaceChildren();
    if (!list.length) { const el = document.createElement('div'); el.className = 'empty'; el.textContent = '还没有收藏的作品。生成图纸后，点击「保存作品」就能从这里继续编辑。'; container.append(el); }
    list.forEach(p => {
      try { E.validate(p); } catch (_) { return; }
      const card = document.createElement('article'); card.className = 'project-card'; const strips = document.createElement('div'); strips.className = 'project-colors'; E.statistics(p).slice(0, 8).forEach(c => { const i = document.createElement('i'); i.style.background = c.hex; strips.append(i); });
      const title = document.createElement('h3'); title.textContent = p.title; const info = document.createElement('p'); info.textContent = p.width + ' × ' + p.height + ' 格 · ' + new Date(p.updatedAt).toLocaleString('zh-CN');
      const buttons = document.createElement('div'); buttons.className = 'buttons'; const open = document.createElement('button'); open.className = 'outline'; open.textContent = '继续编辑 ↗';
      open.onclick = () => { if (!discard()) return; state.project = JSON.parse(JSON.stringify(p)); state.image = null; state.dirty = false; state.history = []; state.future = []; setPage('studio'); resetView(); setMode('grid'); update(); };
      const remove = document.createElement('button'); remove.className = 'delete'; remove.textContent = '删除'; remove.onclick = () => { if (!confirm('删除「' + p.title + '」？删除后无法恢复。')) return; try { localStorage.setItem(KEY, JSON.stringify(projects().filter(x => x.id !== p.id))); if (state.project.id === p.id) { delete state.project.id; state.dirty = true; update(); } refreshLibrary(); } catch (_) { toast('删除失败，请检查浏览器存储权限'); } };
      buttons.append(open, remove); card.append(strips, title, info, buttons); container.append(card);
    });
  }
  function save() {
    if (!state.project) return;
    const title = prompt('给作品起个名字', state.project.title); if (!title || !title.trim()) return;
    const copy = JSON.parse(JSON.stringify(state.project)); copy.title = title.trim().slice(0, 40); copy.id = copy.id || 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); copy.updatedAt = Date.now();
    try { E.validate(copy); localStorage.setItem(KEY, JSON.stringify([copy].concat(projects().filter(p => p.id !== copy.id)))); state.project = copy; state.dirty = false; update(); refreshLibrary(); toast('已保存到「我的作品」'); } catch (_) { toast('保存失败，浏览器空间不足或存储不可用。请导出工程备份。'); }
  }
  function setPage(page) { if (state.busy) return; $('studio').hidden = page !== 'studio'; $('library').hidden = page !== 'library'; document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.page === page)); if (page === 'library') refreshLibrary(); else requestAnimationFrame(resize); window.scrollTo(0, 0); }
  function download(blob, filename) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
  async function exportImages(type) {
    if (state.busy || !state.project) return;
    state.busy = true; const panel = $('exportResults'); panel.textContent = '正在绘制高清图纸…'; exportUrls.forEach(URL.revokeObjectURL); exportUrls = [];
    try {
      await new Promise(r => setTimeout(r, 30)); const pages = R.exportPlan(state.project, type), nodes = [];
      for (let i = 0; i < pages.length; i++) {
        const canvas = document.createElement('canvas'), page = pages[i]; canvas.width = page.width; canvas.height = page.height; R.exportPage(canvas.getContext('2d'), state.project, page, i, pages.length);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); if (!blob) throw Error('图纸导出失败');
        const url = URL.createObjectURL(blob); exportUrls.push(url); const a = document.createElement('a'), img = new Image(); img.src = url; img.alt = page.kind === 'legend' ? '用豆清单' : '拼豆图纸';
        a.href = url; a.download = '豆屿-' + state.project.title.replace(/[\\/:*?"<>|]/g, '_') + '-' + type + '-' + (i + 1) + '.png'; a.append(img, document.createTextNode((i + 1) + '. ' + (page.kind === 'legend' ? '用豆清单' : page.kind === 'effect' ? '拼豆效果' : '施工图') + ' · 点击下载')); nodes.push(a);
      }
      panel.replaceChildren(...nodes); toast('已生成 ' + pages.length + ' 张图片');
    } catch (error) { panel.textContent = error.message; }
    finally { state.busy = false; }
  }
  document.querySelectorAll('.nav').forEach(b => { b.onclick = () => setPage(b.dataset.page); }); $('newProject').onclick = () => setPage('studio');
  document.querySelectorAll('#viewModes button').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
  document.querySelectorAll('#sizes button').forEach(b => { b.onclick = () => { $('width').value = b.dataset.width; changed(); }; });
  ['width', 'maxColors', 'nearest', 'transparent', 'denoise'].forEach(id => $(id).addEventListener('input', changed));
  ['ratio', 'fit', 'cropZoom', 'offsetX', 'offsetY'].forEach(id => $(id).addEventListener('input', () => { changed(); if (state.image) setMode('original'); }));
  $('rotate').onclick = () => { state.rotation = (state.rotation + 90) % 360; changed(); if (state.image) setMode('original'); };
  $('import').onclick = () => { $('file').value = ''; $('file').click(); }; $('file').onchange = e => importFile(e.target.files[0]);
  $('import').ondragover = e => { e.preventDefault(); $('import').classList.add('dragover'); }; $('import').ondragleave = () => $('import').classList.remove('dragover'); $('import').ondrop = e => { e.preventDefault(); $('import').classList.remove('dragover'); importFile(e.dataTransfer.files[0]); };
  $('generate').onclick = () => generate(); $('demo').onclick = () => demo(); $('zoomIn').onclick = () => zoom(1.4); $('zoomOut').onclick = () => zoom(1 / 1.4); $('resetZoom').onclick = resetView;
  document.querySelectorAll('#tools button').forEach(b => { b.onclick = () => tool(b.dataset.tool); }); $('undo').onclick = undo; $('redo').onclick = redo; $('save').onclick = save;
  $('allColors').onclick = () => { $('colorSearch').value = ''; $('allSwatches').replaceChildren(...state.project.palette.colors.map(c => swatch(c))); $('paletteDialog').showModal(); };
  $('colorSearch').oninput = () => $('allSwatches').replaceChildren(...state.project.palette.colors.filter(c => c.code.toLowerCase().includes($('colorSearch').value.trim().toLowerCase())).map(c => swatch(c)));
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => $(b.dataset.close).close(); }); $('export').onclick = () => { if (state.project) $('exportDialog').showModal(); }; document.querySelectorAll('[data-export]').forEach(b => { b.onclick = () => exportImages(b.dataset.export); });
  $('downloadCsv').onclick = () => download(new Blob([E.csv(state.project)], { type: 'text/csv;charset=utf-8' }), '豆屿-用豆清单.csv');
  $('backup').onclick = () => download(new Blob([JSON.stringify(state.project, null, 2)], { type: 'application/json' }), '豆屿-工程.json');
  $('restore').onclick = () => { $('projectFile').value = ''; $('projectFile').click(); };
  $('projectFile').onchange = async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast('工程文件不能超过 2 MB');
    try {
      const restored = E.validate(JSON.parse(await file.text())); if (!discard()) return;
      delete restored.id; state.project = restored; state.image = null; state.history = []; state.future = []; state.dirty = true;
      setPage('studio'); resetView(); setMode('grid'); update(); toast('工程已恢复，可编辑后保存到作品库');
    } catch (error) { toast('无法导入工程：' + error.message); }
  };
  window.addEventListener('keydown', e => { if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) || document.querySelector('dialog[open]')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); } });
  window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  new ResizeObserver(resize).observe(board); resize(); refreshLibrary(); demo(true);
})();
