// First-run data: brands, categories and the full product catalog from catalog/catalog.json
// (built from the Gyraf Audio shop data and the Sessiondesk 2026 price list + product data).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { db, UPLOAD_DIR, uniqueSlug } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'catalog', 'catalog.json');

const BRANDS = {
  'Gyraf Audio': {
    slug: 'gyraf-audio', origin: 'Designed and handcrafted in Aarhus, Denmark', sort: 1, website: 'https://www.gyraf.dk',
    tagline: 'Crafting artistry in audio tools — tube and passive processors for mixing and mastering, from Aarhus, Denmark.',
    description: 'Gyraf Audio is an artisanal electronics workshop in a large studio complex in Aarhus, Denmark, with over thirty years of experience in professional audio and recording. It began by building limited runs for clients who wanted the quality of its studio-built designs.\n\nThe focus is mainly on mixing and mastering tools — microphone preamplifiers, equalizers and compressors — built on tuned passive circuits with tubes and minimal feedback, and solid-state technology where it serves the sound. Gyraf’s guiding principle: “…if it sounds right, it is right.”',
  },
  Sessiondesk: {
    slug: 'sessiondesk', origin: 'Designed in Germany, crafted in Portugal', sort: 2, website: 'https://www.sessiondesk.com',
    tagline: 'Premium studio furniture and precision acoustic treatments for recording, mixing, mastering and broadcast.',
    description: 'Sessiondesk designs and manufactures premium studio furniture and precision acoustic treatments for recording, mixing, mastering and broadcast environments. From ergonomic desks to high-performance acoustic panels, the range works together to turn your space into a professional-grade sonic environment.\n\nThe line-up includes the TAV, HOME and MODULAR desk series, V-STAND and STAND-UP speaker stands, ALEA racks, and SessionbloX — a tool-free modular system of acoustic panels.',
  },
  Elysia: {
    slug: 'elysia', origin: 'Developed and built in Germany', sort: 3, website: 'https://elysia.com',
    tagline: 'High-end analog processors in class-A technology — for recording, mixing and mastering, as 19" units, 500 series modules and qube.',
    description: 'elysia develops and builds high-end analog audio processors in Germany: compressors, equalizers, saturators, transient shapers, preamps and channel strips, built in class-A technology with discrete circuit designs.\n\nThe range spans mastering classics like the alpha compressor and xmax, studio workhorses like xpressor|neo, xfilter, nvelope and karacter, and the channex|studio recall channel strip. Most designs come in three formats with the same sound: 19" rack, 500 series module, and the portable qube.',
  },
};

function copyImage(name) {
  const src = path.join(ROOT, 'catalog', 'images', name);
  if (!fs.existsSync(src)) return null;
  const dest = path.join(UPLOAD_DIR, `cat-${name}`);
  if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
  return `/uploads/cat-${name}`;
}

/**
 * Load catalog.json. Products are matched by brand + name: existing ones get the catalog's
 * prices, texts and photos (photos only if the catalog has some); new ones are added.
 * Your own edits to products that are not in the catalog are never touched.
 */
export function loadCatalog({ log = console.log, onlyNew = false } = {}) {
  if (!fs.existsSync(CATALOG)) { log('[catalog] catalog/catalog.json not found — nothing loaded.'); return; }
  const cat = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const brandId = {}, catId = {};
  db.exec('BEGIN');
  try {
    for (const b of cat.brands) {
      const meta = BRANDS[b.name] || { slug: uniqueSlug('brands', b.name) };
      let row = db.prepare('SELECT id, logo, hero FROM brands WHERE lower(name) = lower(?)').get(b.name);
      const logo = b.logo ? copyImage(b.logo) : '';
      const hero = b.hero ? copyImage(b.hero) : '';
      if (!row) {
        const r = db.prepare(`INSERT INTO brands(slug, name, origin, tagline, tagline_ka, description, description_ka, website, logo, hero, sort)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(meta.slug, b.name, meta.origin || '', meta.tagline || '', meta.tagline_ka || '',
          meta.description || '', meta.description_ka || '', meta.website || '', logo || '', hero || '', meta.sort || 0);
        row = { id: Number(r.lastInsertRowid) };
      } else {
        if (logo && !row.logo) db.prepare('UPDATE brands SET logo = ? WHERE id = ?').run(logo, row.id);
        if (hero && !row.hero) db.prepare('UPDATE brands SET hero = ? WHERE id = ?').run(hero, row.id);
      }
      brandId[b.name] = row.id;
    }
    cat.categories.forEach(([name, ka, kind], i) => {
      let row = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)').get(name);
      if (!row) row = { id: Number(db.prepare('INSERT INTO categories(slug, name, name_ka, kind, sort) VALUES(?,?,?,?,?)').run(uniqueSlug('categories', name), name, ka, kind, i).lastInsertRowid) };
      else db.prepare('UPDATE categories SET kind = ?, sort = ? WHERE id = ?').run(kind, i, row.id);
      catId[name] = row.id;
    });
    let added = 0, updated = 0;
    cat.products.forEach((p, i) => {
      const images = p.images.map(copyImage).filter(Boolean);
      const data = {
        name: p.name, brand_id: brandId[p.brand] ?? null, category_id: catId[p.category] ?? null, sku: p.sku || '',
        price_eur: p.price_eur || 0, price_from: p.price_from ? 1 : 0, variants: p.variants || '',
        availability: p.availability || 'order', lead_time: p.lead_time || '', summary: p.summary || '',
        description: p.description || '', specs: p.specs || '', featured: p.featured ? 1 : 0, sort: i,
      };
      const existing = db.prepare('SELECT id, images, published FROM products WHERE lower(name) = lower(?) AND brand_id IS ?').get(p.name, data.brand_id);
      // On a running shop, only add products that are new in the catalog; never overwrite edits made in the admin panel.
      if (onlyNew && existing) return;
      // Products without any photo stay hidden from the shop until photos are added in the admin panel.
      // Studio (room) photos belong in the gallery, not on product listings: drop any that an earlier catalog attached.
      let ownImages = [];
      try { ownImages = JSON.parse(existing?.images || '[]').filter((src) => !String(src).includes('-studio-')); } catch {}
      if (existing && !images.length) data.images = JSON.stringify(ownImages);
      const hasOwnImages = ownImages.length > 0;
      // Catalog products with product photos are shown; ones without stay hidden until photos are added.
      data.published = images.length ? 1 : hasOwnImages ? (existing ? existing.published : 1) : 0;
      if (existing) {
        if (images.length) data.images = JSON.stringify(images);
        const keys = Object.keys(data);
        db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')}, sample = 0, updated_at = datetime('now') WHERE id = ?`).run(...keys.map((k) => data[k]), existing.id);
        updated++;
      } else {
        data.images = JSON.stringify(images);
        data.slug = uniqueSlug('products', p.slug || p.name);
        const keys = Object.keys(data);
        db.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => data[k]));
        added++;
      }
    });
    // Studio gallery: only filled in when it is empty, so your own edits are kept.
    if (cat.gallery && db.prepare('SELECT COUNT(*) n FROM gallery').get().n === 0) {
      const ins = db.prepare('INSERT INTO gallery(image, caption, credit, sort) VALUES(?,?,?,?)');
      cat.gallery.forEach((g, i) => { const img = copyImage(g.image); if (img) ins.run(img, g.caption || '', g.credit || '', i); });
    }
    // Remove the placeholder demo products from the first version, if they are still there.
    const removed = db.prepare('DELETE FROM products WHERE sample = 1').run().changes;
    db.exec('COMMIT');
    log(`[catalog] ${added} products added, ${updated} updated${removed ? `, ${removed} demo products removed` : ''}.`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Home page texts that still carry an earlier default are brought up to date; texts you changed yourself are left alone.
const OLD_DEFAULTS = {
  hero_text: ['Luminescent Gear is the official dealer in Georgia for Gyraf Audio and Sessiondesk: hand-built tube processors from Denmark and studio furniture designed in Germany, with prices in lari or euro and local support after the sale.'],
};
function refreshDefaultTexts() {
  for (const [key, olds] of Object.entries(OLD_DEFAULTS)) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (row && olds.includes(row.value)) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  }
}

export function seedIfEmpty() {
  refreshDefaultTexts();
  const version = fs.existsSync(CATALOG) ? crypto.createHash('sha1').update(fs.readFileSync(CATALOG)).digest('hex') : '';
  const setVersion = () => db.prepare("INSERT INTO settings(key, value) VALUES('catalog_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(version);
  if (db.prepare('SELECT COUNT(*) n FROM brands').get().n === 0) { loadCatalog(); setVersion(); return; }
  // A newer catalog shipped with the code (e.g. a new brand): add what's new, keep everything else as it is.
  const current = db.prepare("SELECT value FROM settings WHERE key = 'catalog_version'").get()?.value;
  if (current !== version) { loadCatalog({ onlyNew: true }); setVersion(); }
}
