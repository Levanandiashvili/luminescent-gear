// Entry point. Run with: npm start   (Node.js 22.13 or newer, no packages to install)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCookies, send } from './src/http.js';
import { UPLOAD_DIR, db } from './src/db.js';
import { storeRoutes, notFound } from './src/store.js';
import { adminRoutes } from './src/admin.js';
import { refreshRate } from './src/rates.js';
import { seedIfEmpty } from './src/seed.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const TYPES = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain' };

function serveFile(res, base, rel, extra = {}) {
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return false;
  let st; try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size,
    'X-Content-Type-Options': 'nosniff', ...extra });
  fs.createReadStream(file).pipe(res);
  return true;
}

seedIfEmpty();
refreshRate().catch(() => {});
setInterval(() => refreshRate().catch(() => {}), 30 * 60e3).unref();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  req.cookies = parseCookies(req);
  try {
    if (url.pathname.startsWith('/static/') && req.method === 'GET') {
      if (serveFile(res, PUBLIC, url.pathname.slice(8), { 'Cache-Control': 'public, max-age=3600' })) return;
    }
    if (url.pathname.startsWith('/uploads/') && req.method === 'GET') {
      // Uploaded files are content-addressed, so they can be cached for a long time. CSP neuters any script in an SVG.
      if (serveFile(res, UPLOAD_DIR, decodeURIComponent(url.pathname.slice(9)), {
        'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" })) return;
    }
    if (url.pathname === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /admin\nDisallow: /invoice/\nDisallow: /cart\n', { 'Content-Type': 'text/plain' });
    if (url.pathname === '/healthz') { db.prepare('SELECT 1').get(); return send(res, 200, 'ok', { 'Content-Type': 'text/plain' }); }
    if (await adminRoutes(req, res, url)) return;
    if (await storeRoutes(req, res, url)) return;
    notFound(req, res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, e.status === 413 ? 'That file is too large (15 MB maximum).' : 'Something went wrong on the server. Check the server log for details.', { 'Content-Type': 'text/plain; charset=utf-8' });
    else res.end();
  }
});
server.listen(PORT, () => console.log(`Shop running on http://localhost:${PORT}  —  admin at /admin`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
