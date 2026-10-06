const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() && !['node_modules', '.git', 'test-results'].includes(e.name) ? walk(path.join(dir, e.name)) : e.isFile() ? [path.join(dir, e.name)] : []); }
const files = walk(root);
for (const file of files) {
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file]);
  if (file.endsWith('.json')) JSON.parse(fs.readFileSync(file, 'utf8'));
}
const js = fs.readFileSync(path.join(root, 'miniprogram/pages/studio/studio.js'), 'utf8');
const wxml = fs.readFileSync(path.join(root, 'miniprogram/pages/studio/studio.wxml'), 'utf8');
for (const match of wxml.matchAll(/(?:bind|catch)(?:tap|change|input|touchstart|touchmove|touchend|touchcancel)="(\w+)"/g)) {
  if (!new RegExp('\\b' + match[1] + '\\s*\\(').test(js)) throw Error('Missing WXML handler: ' + match[1]);
}
console.log('Syntax, JSON and WXML event-handler checks passed (' + files.length + ' files).');
