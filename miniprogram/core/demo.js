(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BeadDemo = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  // Original geometric illustration, drawn locally without external assets.
  function draw(ctx, size) {
    ctx.clearRect(0, 0, size, size); ctx.save(); ctx.scale(size / 320, size / 320);
    const rect = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
    const ellipse = (x, y, rx, ry, color) => { ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
    rect(0, 0, 320, 320, '#eef0dc');
    ellipse(260, 64, 30, 30, '#f6cc68');
    rect(32, 50, 8, 8, '#8fa994'); rect(40, 42, 8, 8, '#8fa994'); rect(40, 58, 8, 8, '#8fa994'); rect(48, 50, 8, 8, '#8fa994');
    ellipse(160, 265, 112, 17, '#c6d5ba');
    ellipse(98, 169, 29, 70, '#719c80'); ellipse(224, 202, 27, 50, '#507e6a');
    ellipse(108, 93, 26, 48, '#af6449'); ellipse(206, 93, 26, 48, '#af6449');
    ellipse(108, 98, 13, 30, '#eeb698'); ellipse(206, 98, 13, 30, '#eeb698');
    ellipse(158, 183, 70, 87, '#cc8760'); ellipse(158, 154, 78, 64, '#dfaa73');
    ellipse(158, 200, 43, 47, '#f5dfb4');
    ellipse(127, 150, 7, 10, '#423a34'); ellipse(190, 150, 7, 10, '#423a34');
    ellipse(108, 171, 12, 7, '#df927e'); ellipse(208, 171, 12, 7, '#df927e');
    ellipse(159, 171, 7, 5, '#794e3d');
    rect(157, 174, 4, 11, '#794e3d'); rect(148, 183, 11, 3, '#794e3d'); rect(160, 183, 10, 3, '#794e3d');
    ellipse(123, 258, 28, 13, '#af6449'); ellipse(193, 258, 28, 13, '#af6449');
    rect(234, 239, 4, 24, '#6c916b'); ellipse(236, 230, 14, 14, '#f7c868'); ellipse(236, 230, 5, 5, '#af6449');
    ctx.restore();
  }
  return { draw };
});
