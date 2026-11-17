// Luminescent Mastering website. Run with: npm start   (Node.js 22 or newer, no packages to install)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { send, redirect, SECURITY_HEADERS } from './src/http.js';
import { load, DATA_DIR, savedFile } from './src/content.js';
import { adminRoutes } from './src/admin.js';
import { configured } from './src/auth.js';
import * as rack from './src/designs/rack.js';
import * as clean from './src/designs/clean.js';
import { PDF_PATH } from './src/page.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 8080);
// When set (to luminescentmastering.com), www.luminescentmastering.com forwards there.
const CANONICAL_HOST = (process.env.CANONICAL_HOST || '').trim().toLowerCase();

const TYPES = {
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

// A short fingerprint of the files in public/, added to their addresses so browsers fetch new versions after a deploy.
const V = (() => {
  const h = crypto.createHash('sha256');
  for (const f of fs.readdirSync(PUBLIC, { recursive: true }).sort()) {
    const full = path.join(PUBLIC, f);
    if (fs.statSync(full).isFile()) h.update(f).update(fs.readFileSync(full));
  }
  return h.digest('hex').slice(0, 10);
})();
const opts = { v: V };

const DESIGN_RENDERERS = { rack, clean };
export const renderPage = (content, o = opts) => (DESIGN_RENDERERS[content.design] || rack).render(content, o);

// The page is rendered once and kept until the texts or the design change.
let cached = null;
function homePage() {
  if (!cached) {
    const body = Buffer.from(renderPage(load()));
    cached = { body, gz: zlib.gzipSync(body, { level: 9 }), etag: `"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20)}"` };
  }
  return cached;
}
const onChange = () => { cached = null; };

function serveFile(req, res, file, cache) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, ...SECURITY_HEADERS });
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://local');
    const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
    const get = req.method === 'GET' || req.method === 'HEAD';

    if (url.pathname === '/healthz') return send(res, 200, 'ok\n', { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });

    if (CANONICAL_HOST && host === `www.${CANONICAL_HOST}`) return redirect(res, `https://${CANONICAL_HOST}${url.pathname}${url.search}`, 301);

    if (url.pathname.startsWith('/static/') && get) {
      let rel = '';
      try { rel = decodeURIComponent(url.pathname.slice(8)); } catch { /* bad address */ }
      const file = path.normalize(path.join(PUBLIC, rel));
      const versioned = url.searchParams.get('v') === V;
      if (file.startsWith(PUBLIC + path.sep) && serveFile(req, res, file, versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')) return;
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }

    if (url.pathname === PDF_PATH && get) {
      if (serveFile(req, res, path.join(PUBLIC, PDF_PATH.slice(1)), 'public, max-age=86400')) return;
    }

    if (await adminRoutes(req, res, url, { opts, renderPage, onChange })) return;

    if (url.pathname === '/robots.txt') return send(res, 200, 'User-agent: *\nDisallow: /admin\n', { 'Content-Type': 'text/plain; charset=utf-8' });
    if (url.pathname === '/favicon.ico' && get) return redirect(res, `/static/icon-64.png?v=${V}`, 301);

    if (url.pathname === '/' && get) {
      const page = homePage();
      const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', ETag: page.etag, Vary: 'Accept-Encoding', ...SECURITY_HEADERS };
      if (req.headers['if-none-match'] === page.etag) { res.writeHead(304, headers); return res.end(); }
      const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      const body = gzip ? page.gz : page.body;
      res.writeHead(200, { ...headers, 'Content-Length': body.length, ...(gzip ? { 'Content-Encoding': 'gzip' } : {}) });
      return res.end(req.method === 'HEAD' ? undefined : body);
    }

    // Old or mistyped links go to the home page.
    if (get) return redirect(res, '/', 301);
    return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, e.status === 413 ? 'That was too much text to save at once.' : 'Something went wrong on the server.', { 'Content-Type': 'text/plain; charset=utf-8' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Luminescent Mastering on http://localhost:${PORT} (admin at /admin)`);
  console.log(`Texts: ${fs.existsSync(savedFile) ? savedFile : 'defaults (nothing saved yet)'}; data folder ${DATA_DIR}`);
  if (!configured()) console.log('ADMIN_PASSWORD is not set, so the admin panel shows how to set it.');
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); process.exit(0); });
