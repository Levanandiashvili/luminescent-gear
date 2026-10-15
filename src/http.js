// Small HTTP helpers: escaping, cookies, body parsing, responses, sessions.
import crypto from 'node:crypto';

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Tagged template that escapes interpolations unless wrapped with raw(). Arrays are joined. */
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => {
    out += s;
    if (i < vals.length) out += render(vals[i]);
  });
  return raw(out);
}
function render(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join('');
  return esc(v);
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
export async function readForm(req) {
  const buf = await readBody(req, 2e6);
  const ct = req.headers['content-type'] || '';
  if (ct.includes('application/json')) return JSON.parse(buf.toString('utf8') || '{}');
  return Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
}

const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'SAMEORIGIN',
};
export function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...SEC_HEADERS, ...headers });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : String(body));
}
export const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json' });
export const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, ...headers }); res.end(); };

// ---- Signed session cookie for the admin ----
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.SESSION_SECRET) console.warn('[warn] SESSION_SECRET not set — admin sessions reset on every restart.');

const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
export function makeSession(user, hours = 12) {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: Date.now() + hours * 3600e3 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}
export function readSession(req) {
  const c = parseCookies(req).adm;
  if (!c) return null;
  const [payload, sig] = c.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.exp > Date.now() ? d : null;
  } catch { return null; }
}
export const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
export const sessionCookie = (req, value, maxAge) =>
  `adm=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`;

export function checkPassword(input) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  return crypto.timingSafeEqual(a, b);
}

/** Same-origin check for state-changing admin requests (defence in depth beside SameSite=Strict). */
export function sameOrigin(req) {
  const origin = req.headers.origin || req.headers.referer;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
