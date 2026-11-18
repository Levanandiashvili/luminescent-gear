// The site's texts and chosen design: defaults in content/default.json, Levan's edits in DATA_DIR/content.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const FILE = path.join(DATA_DIR, 'content.json');
const HISTORY = path.join(DATA_DIR, 'history');
const KEEP_VERSIONS = 30;

export const DESIGNS = {
  rack: 'Rack',
  clean: 'Clean',
};

/** The page's sections, by their anchor on the page. */
export const SECTIONS = {
  services: 'Services',
  equipment: 'Equipment',
  rates: 'Rates',
  clients: 'Artists',
  send: 'Send your music',
  contact: 'Contact',
};

export const DEFAULTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'default.json'), 'utf8'));

fs.mkdirSync(HISTORY, { recursive: true });

// ---- Cleaning: everything that is saved or shown goes through normalize() ----

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
function str(v, max = 2000) {
  return String(v ?? '').replace(/\r\n?/g, '\n').replace(CONTROL, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, max);
}
const line = (v, max = 200) => str(v, max).replace(/\s*\n\s*/g, ' ');

function list(rows, max, clean) {
  if (!Array.isArray(rows)) return [];
  return rows.map(clean).filter((r) => Object.values(r).some((v) => v !== '')).slice(0, max);
}

const EMAIL = /^[^\s@<>()"]+@[^\s@<>()"]+\.[^\s@<>()"]+$/;
function safeUrl(u) {
  const s = line(u, 500);
  if (!s) return '';
  if (/^mailto:/i.test(s) && EMAIL.test(s.slice(7))) return s;
  if (EMAIL.test(s)) return `mailto:${s}`;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

const collator = new Intl.Collator('en', { sensitivity: 'base', ignorePunctuation: true, numeric: true });
const sortName = (n) => n.replace(/^the\s+/i, '');
export const byName = (a, b) => collator.compare(sortName(a), sortName(b));

/** Turns any input into a complete, safe content object. Returns { content, warnings }. */
export function normalize(input = {}) {
  const c = input && typeof input === 'object' ? input : {};
  const warnings = [];
  const sec = (k) => (c[k] && typeof c[k] === 'object' ? c[k] : {});

  const links = [];
  for (const l of Array.isArray(sec('contact').links) ? sec('contact').links : []) {
    const label = line(l?.label, 80);
    const url = safeUrl(l?.url);
    if (!label && !url) continue;
    if (url === null) { warnings.push(`The link "${label || l?.url}" was left out: its address doesn't look like a web address.`); continue; }
    if (!url) { warnings.push(`The link "${label}" was left out: it has no address.`); continue; }
    links.push({ label: label || url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''), url });
  }

  let email = line(sec('contact').email, 200).replace(/^mailto:/i, '');
  if (email && !EMAIL.test(email)) {
    warnings.push(`"${email}" doesn't look like an email address, so it was left off the page.`);
    email = '';
  }

  const seen = new Set();
  const names = [];
  const rawNames = sec('artists').names;
  for (const n of Array.isArray(rawNames) ? rawNames : String(rawNames ?? '').split('\n')) {
    const name = line(n, 120);
    const key = name.toLocaleLowerCase('en');
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  names.sort(byName);

  const content = {
    design: Object.hasOwn(DESIGNS, c.design) ? c.design : 'rack',
    seo: {
      title: line(sec('seo').title, 120) || 'Luminescent Mastering',
      description: line(sec('seo').description, 320),
    },
    intro: str(c.intro, 1500),
    cta: line(c.cta, 60),
    ctaTarget: Object.hasOwn(SECTIONS, c.ctaTarget) ? c.ctaTarget : 'contact',
    services: {
      nav: line(sec('services').nav, 40),
      title: line(sec('services').title, 120),
      items: list(sec('services').items, 16, (r) => ({ title: line(r?.title, 120), text: str(r?.text, 3000) })),
    },
    equipment: {
      nav: line(sec('equipment').nav, 40),
      title: line(sec('equipment').title, 120),
      rows: list(sec('equipment').rows, 24, (r) => ({ label: line(r?.label, 80), items: str(r?.items, 1500) })),
    },
    rates: {
      nav: line(sec('rates').nav, 40),
      title: line(sec('rates').title, 120),
      rows: list(sec('rates').rows, 24, (r) => ({
        name: line(r?.name, 80), note: line(r?.note, 80), price: line(r?.price, 40), unit: line(r?.unit, 40),
      })),
      terms: str(sec('rates').terms, 3000),
    },
    artists: {
      nav: line(sec('artists').nav, 40),
      title: line(sec('artists').title, 120),
      more: line(sec('artists').more, 120),
      names: names.slice(0, 3000),
    },
    send: {
      nav: line(sec('send').nav, 40),
      title: line(sec('send').title, 120),
      blocks: list(sec('send').blocks, 16, (r) => ({ title: line(r?.title, 120), text: str(r?.text, 4000) })),
      guideButton: line(sec('send').guideButton, 60),
      guideText: str(sec('send').guideText, 600),
    },
    contact: {
      nav: line(sec('contact').nav, 40),
      title: line(sec('contact').title, 120),
      emailLabel: line(sec('contact').emailLabel, 40),
      email,
      linksLabel: line(sec('contact').linksLabel, 40),
      links: links.slice(0, 16),
    },
    footer: line(c.footer, 200),
  };
  return { content, warnings };
}

// ---- Loading and saving ----

let current = null;

export function load() {
  if (current) return current;
  try {
    current = normalize(JSON.parse(fs.readFileSync(FILE, 'utf8'))).content;
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[content] could not read', FILE, '-', e.message, '- using the defaults');
    current = normalize(DEFAULTS).content;
  }
  return current;
}

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

/** Saves new content and keeps the previous version in the history folder. */
export function save(next) {
  const clean = normalize(next).content;
  const text = `${JSON.stringify(clean, null, 2)}\n`;
  if (fs.existsSync(FILE)) {
    const prev = fs.readFileSync(FILE, 'utf8');
    if (prev === text) { current = clean; return clean; }
    writeAtomic(path.join(HISTORY, `${stamp()}.json`), prev);
  } else {
    writeAtomic(path.join(HISTORY, `${stamp()}-original.json`), `${JSON.stringify(load(), null, 2)}\n`);
  }
  writeAtomic(FILE, text);
  current = clean;
  prune();
  return clean;
}

function prune() {
  const files = history();
  for (const f of files.slice(KEEP_VERSIONS)) {
    try { fs.unlinkSync(path.join(HISTORY, f.name)); } catch { /* already gone */ }
  }
}

/** Earlier versions, newest first. */
export function history() {
  let names = [];
  try { names = fs.readdirSync(HISTORY).filter((n) => /^[\w-]+\.json$/.test(n)); } catch { return []; }
  return names.sort().reverse().map((name) => {
    const m = name.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/);
    const when = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7])) : null;
    return { name, when, original: name.includes('original') };
  });
}

export function restore(name) {
  if (!/^[\w-]+\.json$/.test(name)) return false;
  const file = path.join(HISTORY, name);
  if (!fs.existsSync(file)) return false;
  save(JSON.parse(fs.readFileSync(file, 'utf8')));
  return true;
}

export const savedFile = FILE;
