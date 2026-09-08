import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = resolve(root, 'dist');
const api = createApi({http:process.env.ROBINHOOD_RPC_URL,ws:process.env.ROBINHOOD_WS_URL,logsHttp:process.env.ROBINHOOD_LOGS_RPC_URL});
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.wasm':'application/wasm', '.gz':'application/octet-stream' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  try {
    if (await api(req,res)) return;
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/health') {
      const body = JSON.stringify({ status:'ok', service:'flywire.live' });
      res.writeHead(200, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body); return;
    }
    const file = resolve(dist, '.' + (pathname === '/' ? '/index.html' : ['/admin','/admin/'].includes(pathname) ? '/admin.html' : pathname));
    if (!file.startsWith(dist + sep) || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404); res.end(); return;
    }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    // .gz files are model inputs decompressed by the client, not HTTP encoding.
    res.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (error) {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(error.code === 'ENOENT' ? 404 : error instanceof URIError ? 400 : 503, { 'Cache-Control':'no-store' });
    res.end('Request unavailable');
  }
});
// Keep the single shared watcher active even when no browser is connected.
api.start();
server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('flywire.live server ready'));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  api.dispose(); server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000).unref();
});
