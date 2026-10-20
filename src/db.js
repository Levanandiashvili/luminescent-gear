// SQLite storage using Node's built-in driver (node:sqlite). No external dependencies.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'store.db'));
db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

db.exec(`
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  origin TEXT DEFAULT '',
  tagline TEXT DEFAULT '',
  tagline_ka TEXT DEFAULT '',
  description TEXT DEFAULT '',
  description_ka TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  hero TEXT DEFAULT '',
  website TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_ka TEXT DEFAULT '',
  kind TEXT DEFAULT 'gear',   -- gear | furniture | acoustics | other (picks the placeholder drawing)
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  sku TEXT DEFAULT '',
  price_eur REAL DEFAULT 0,
  price_gel_fixed REAL,         -- optional fixed GEL price; otherwise converted from EUR
  price_from INTEGER DEFAULT 0, -- show "from" before the price (configurable products)
  availability TEXT DEFAULT 'order', -- in_stock | order | preorder | on_request
  lead_time TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  summary_ka TEXT DEFAULT '',
  description TEXT DEFAULT '',
  description_ka TEXT DEFAULT '',
  specs TEXT DEFAULT '',        -- one "Label: value" per line
  images TEXT DEFAULT '[]',     -- JSON array of /uploads/... paths
  featured INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1,
  sample INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'awaiting_payment', -- awaiting_payment | paid | shipped | completed | cancelled
  currency TEXT NOT NULL,
  rate REAL NOT NULL,
  rate_source TEXT DEFAULT '',
  customer TEXT NOT NULL,     -- JSON
  items TEXT NOT NULL,        -- JSON, prices frozen at time of invoice
  total REAL NOT NULL,
  lang TEXT DEFAULT 'en',
  admin_note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  due_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS gallery (
  id INTEGER PRIMARY KEY,
  image TEXT NOT NULL,
  caption TEXT DEFAULT '',
  credit TEXT DEFAULT '',
  sort INTEGER DEFAULT 0,
  published INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
`);

// Columns added after the first release.
const productCols = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
if (!productCols.includes('variants')) db.exec("ALTER TABLE products ADD COLUMN variants TEXT DEFAULT ''");

export const DEFAULT_SETTINGS = {
  ordering_enabled: '0',    // 1 = cart + bank-transfer invoices; 0 = estimated prices and quote requests only
  company_name: 'Luminescent Gear',
  site_url: 'https://luminescentgear.ge',
  company_legal: '',
  company_id: '',
  company_address: 'Tbilisi, Georgia',
  company_email: 'info@luminescentgear.ge',
  company_phone: '',
  company_whatsapp: '',
  company_instagram: '',
  vat_payer: '1',
  vat_rate: '18',
  bank_name: 'Bank of Georgia',
  bank_swift: 'BAGAGE22',
  bank_beneficiary: '',
  iban_gel: '',
  iban_eur: '',
  invoice_prefix: 'INV',
  invoice_valid_days: '5',
  invoice_note: 'Please use the invoice number as the payment reference. Delivery time is confirmed once payment is received.',
  rate_mode: 'bog',         // bog | nbg | manual
  rate_manual: '2.95',
  discount_pct: '10',      // sale: percent off every price; the old price is shown crossed out (0 = no sale)
  rate_markup: '0',         // percent added on top of the bank rate
  gel_rounding: '1',        // round GEL prices to this step (1, 5, 10)
  default_currency: 'GEL',
  hero_title: 'Analogue tools and studio furniture, delivered in Georgia.',
  hero_text: 'Luminescent Gear is the official dealer in Georgia for Gyraf Audio, Elysia and Sessiondesk: hand-built tube processors from Denmark, class-A analog processors and studio furniture from Germany, with prices in lari or euro and local support after the sale.',
};

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setStmt = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

export function getSetting(key) {
  const row = getStmt.get(key);
  return row ? row.value : DEFAULT_SETTINGS[key] ?? '';
}
export function setSetting(key, value) { setStmt.run(key, String(value ?? '')); }
export function allSettings() {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) out[r.key] = r.value;
  return out;
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ა-ჿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
}
export function uniqueSlug(table, base, exceptId = 0) {
  let slug = slugify(base), n = 2;
  const q = db.prepare(`SELECT id FROM ${table} WHERE slug = ? AND id != ?`);
  while (q.get(slug, exceptId)) slug = `${slugify(base)}-${n++}`;
  return slug;
}

/** "Label | 1299" per line → [{label, price}] */
export function parseVariants(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.lastIndexOf('|');
    const label = (i >= 0 ? l.slice(0, i) : l).trim();
    const raw = i >= 0 ? l.slice(i + 1).trim() : '';
    let num = raw.replace(/[^\d.,]/g, '');
    if (/^\d{1,3}(\.\d{3})+$/.test(num)) num = num.replace(/\./g, '');
    else if (num.lastIndexOf(',') > num.lastIndexOf('.')) num = num.replace(/\./g, '').replace(',', '.');
    else num = num.replace(/,/g, '');
    return { label, price: Number(num) || 0 };
  }).filter((v) => v.label);
}

export function parseProduct(p) {
  if (!p) return p;
  let images = [];
  try { images = JSON.parse(p.images || '[]'); } catch {}
  return { ...p, images, variantList: parseVariants(p.variants) };
}

const PRODUCT_SELECT = `SELECT p.*, b.name AS brand_name, b.slug AS brand_slug, c.name AS category_name,
  c.name_ka AS category_name_ka, c.slug AS category_slug, c.kind AS category_kind, c.sort AS category_sort
  FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id`;

export function listProducts({ brand, category, q, featured, includeHidden = false, limit = 500 } = {}) {
  const where = [], args = [];
  if (!includeHidden) where.push('p.published = 1 AND (b.published IS NULL OR b.published = 1)');
  if (brand) { where.push('b.slug = ?'); args.push(brand); }
  if (category) { where.push('c.slug = ?'); args.push(category); }
  if (featured) where.push('p.featured = 1');
  if (q) { where.push('(p.name LIKE ? OR p.sku LIKE ? OR b.name LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const sql = `${PRODUCT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.featured DESC, p.sort ASC, p.name ASC LIMIT ${Number(limit) | 0}`;
  return db.prepare(sql).all(...args).map(parseProduct);
}
export function getProduct(slugOrId, includeHidden = false) {
  const byId = typeof slugOrId === 'number';
  const p = db.prepare(`${PRODUCT_SELECT} WHERE ${byId ? 'p.id' : 'p.slug'} = ?`).get(slugOrId);
  if (!p) return null;
  if (!includeHidden && !p.published) return null;
  return parseProduct(p);
}
export const listBrands = (includeHidden = false) =>
  db.prepare(`SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.published = 1) AS product_count
    FROM brands b ${includeHidden ? '' : 'WHERE b.published = 1'} ORDER BY sort, name`).all();
export const getBrand = (slug) => db.prepare('SELECT * FROM brands WHERE slug = ?').get(slug);
export const listCategories = () =>
  db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.published = 1) AS product_count
    FROM categories c ORDER BY sort, name`).all();

export const listGallery = (includeHidden = false) =>
  db.prepare(`SELECT * FROM gallery ${includeHidden ? '' : 'WHERE published = 1'} ORDER BY sort, id`).all();
