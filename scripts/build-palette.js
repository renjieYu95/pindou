const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const rows = fs.readFileSync(path.join(root, 'third-party/mard.csv'), 'utf8').trim().split(/\r?\n/);
const colors = rows.map(line => {
  const [code, name, r, g, b] = line.split(',');
  return { code, name, hex: '#' + [r, g, b].map(v => Number(v).toString(16).padStart(2, '0')).join('') };
}).filter(c => /^[A-HM]\d+$/.test(c.code)).sort((a, b) => a.code[0].localeCompare(b.code[0]) || parseInt(a.code.slice(1)) - parseInt(b.code.slice(1)));
if (colors.length !== 221 || new Set(colors.map(c => c.code)).size !== 221) throw Error('Expected 221 unique MARD colors');
const data = { id: 'mard-221-beadcolors-29229889', name: 'MARD 221', version: '29229889', source: 'https://github.com/maxcleme/beadcolors/tree/29229889', note: '公开整理的屏幕参考色，实物请对照手头色卡；H1 不参与自动匹配。', colors };
const license = fs.readFileSync(path.join(root, 'third-party/beadcolors-LICENSE'), 'utf8');
fs.writeFileSync(path.join(root, 'miniprogram/data/palette.js'), '/*! Color data from maxcleme/beadcolors, revision 29229889.\n' + license + '\n*/\n(function(root, factory) { if (typeof module === "object" && module.exports) module.exports = factory(); else root.BeadPalette = factory(); })(typeof globalThis !== "undefined" ? globalThis : this, function() { return ' + JSON.stringify(data, null, 2) + '; });\n');
console.log('Generated MARD 221 palette');
