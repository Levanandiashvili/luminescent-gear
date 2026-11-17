// Small HTTP helpers: escaping, cookies, bodies and responses.

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Tagged template that escapes every interpolation unless it is wrapped in raw(). Arrays are joined. */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += piece(vals[i]);
  });
  return raw(out);
}
function piece(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(piece).join('');
  return esc(v);
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore bad cookie */ }
    }
  }
  return out;
}

export function readBody(req, limit = 512 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('Body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Reads an urlencoded form into a plain object (the last value wins for repeated names). */
export async function readForm(req) {
  const buf = await readBody(req);
  return Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};

export function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''));
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length, ...SECURITY_HEADERS, ...headers });
  res.end(res.req && res.req.method === 'HEAD' ? undefined : buf);
}

export function redirect(res, to, status = 303, headers = {}) {
  res.writeHead(status, { Location: to, 'Content-Length': 0, ...SECURITY_HEADERS, ...headers });
  res.end();
}

export const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket.encrypted);

/** The visitor's address: Railway's proxy puts it first in X-Forwarded-For. */
export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

/** Defence in depth beside SameSite=Strict: a form post must come from this site. */
export function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
