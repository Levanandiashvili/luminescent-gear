// Turns the plain texts from the admin into safe HTML: blank lines make paragraphs, single line breaks stay,
// and email addresses and web addresses become links.
import { esc, raw } from './http.js';

const LINKABLE = /(\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]|\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b)/gi;

/** One line or paragraph as HTML. */
export function inline(text) {
  const parts = String(text ?? '').split(LINKABLE);
  let out = '';
  parts.forEach((p, i) => {
    if (i % 2 === 0) { out += esc(p).replace(/\n/g, '<br>'); return; }
    const href = p.includes('@') && !/^https?:/i.test(p) ? `mailto:${p}` : p;
    out += `<a href="${esc(href)}">${esc(p)}</a>`;
  });
  return raw(out);
}

/** Splits a text into paragraphs (separated by a blank line). */
export const paragraphs = (text) => String(text ?? '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);

/** Paragraphs as <p> elements; the first one can get a class. */
export function paras(text, firstClass = '') {
  return raw(paragraphs(text).map((p, i) => `<p${i === 0 && firstClass ? ` class="${firstClass}"` : ''}>${inline(p)}</p>`).join('\n'));
}

/** Lines of a list (one per line). */
export const lines = (text) => String(text ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

/** A seeded shuffle, so the page without JavaScript still shows the names mixed, but the same way every time. */
export function shuffled(items, seed = 1015) {
  const a = items.slice();
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** JSON-LD that can sit inside a <script> element. */
export const jsonLd = (obj) => raw(JSON.stringify(obj, null, 2).replace(/</g, '\\u003c'));
