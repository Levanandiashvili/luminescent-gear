// Admin sign-in: one password (ADMIN_PASSWORD in Railway's Variables), a signed cookie, and a form token.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseCookies, isSecure } from './http.js';
import { DATA_DIR } from './content.js';

const COOKIE = 'lm_admin';
const DAYS = 30;

/** The key that signs the cookie: SESSION_SECRET if set, otherwise one kept on the data disk. */
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, '.session-secret');
  try { return fs.readFileSync(file, 'utf8').trim(); } catch { /* make one */ }
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(file, s, { mode: 0o600 }); } catch (e) { console.warn('[auth] could not store the session key:', e.message); }
  return s;
}
const SECRET = loadSecret();

const password = () => process.env.ADMIN_PASSWORD || '';
export const configured = () => password().length > 0;

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
// Ties a session to the current password, so changing the password signs everyone out.
const pwTag = () => sha(`${SECRET}:${password()}`).toString('base64url').slice(0, 12);

export function checkPassword(input) {
  if (!configured()) return false;
  return crypto.timingSafeEqual(sha(input), sha(password()));
}

export function makeSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + DAYS * 864e5, pw: pwTag() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** The signed-in session's cookie value, or null. */
export function session(req) {
  const value = parseCookies(req)[COOKIE];
  if (!value || !configured()) return null;
  const [payload, sig] = value.split('.');
  if (!payload || !sig || !same(sig, sign(payload))) return null;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return d.exp > Date.now() && d.pw === pwTag() ? value : null;
  } catch { return null; }
}

export const sessionCookie = (req, value, maxAge = DAYS * 86400) =>
  `${COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isSecure(req) ? '; Secure' : ''}`;

export const csrfToken = (sessionValue) => sign(`csrf:${sessionValue}`);
export const csrfOk = (sessionValue, token) => typeof token === 'string' && same(token, csrfToken(sessionValue));

// ---- Too many wrong passwords: 8 per address and 40 overall in 15 minutes ----
const WINDOW = 15 * 60e3;
const fails = new Map();
let allFails = [];
const recent = (list) => list.filter((t) => Date.now() - t < WINDOW);

export function tooManyAttempts(ip) {
  allFails = recent(allFails);
  return recent(fails.get(ip) || []).length >= 8 || allFails.length >= 40;
}
export function noteFailure(ip) {
  fails.set(ip, [...recent(fails.get(ip) || []), Date.now()]);
  allFails.push(Date.now());
  if (fails.size > 5000) fails.clear();
}
export const clearFailures = (ip) => fails.delete(ip);
