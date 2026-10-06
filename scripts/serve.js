const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/') { res.writeHead(302, { Location: '/preview/' }); return res.end(); }
    const relative = pathname === '/' ? '/preview/index.html' : pathname;
    const filename = path.resolve(root, '.' + relative);
    if (!filename.startsWith(root + path.sep) || !['preview', 'miniprogram'].includes(path.relative(root, filename).split(path.sep)[0])) { res.writeHead(403); return res.end('Forbidden'); }
    const file = fs.statSync(filename).isDirectory() ? path.join(filename, 'index.html') : filename;
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  } catch (_) { res.writeHead(404); res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4173), '127.0.0.1', () => console.log('豆屿预览：http://127.0.0.1:' + server.address().port + '/preview/'));
