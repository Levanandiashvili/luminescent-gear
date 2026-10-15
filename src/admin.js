// Admin panel: products, brands, categories, orders, price import, settings.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { html, raw, send, redirect, readForm, readBody, sendJson, readSession, makeSession, sessionCookie, checkPassword, sameOrigin } from './http.js';
import { db, UPLOAD_DIR, parseVariants, listGallery, listProducts, getProduct, listBrands, listCategories, allSettings, setSetting, DEFAULT_SETTINGS, uniqueSlug, slugify } from './db.js';
import { currentRate, refreshRate, gelPrice } from './rates.js';
import { fmtMoney } from './layout.js';
import { parseCsv, toCsv, parsePrice } from './csv.js';
import { invoicePage } from './invoice.js';
import { translator } from './i18n.js';

const AVAIL = { in_stock: 'In stock', order: 'Made to order', preorder: 'Pre-order', on_request: 'Price on request' };
const STATUS = { awaiting_payment: 'Awaiting payment', paid: 'Paid', shipped: 'Shipped', completed: 'Completed', cancelled: 'Cancelled' };
const KINDS = { gear: 'Outboard gear', furniture: 'Furniture', acoustics: 'Acoustics', other: 'Other' };

function shell(title, body, { flash = '', section = '' } = {}) {
  const s = allSettings();
  const nav = [['/admin', 'Overview', ''], ['/admin/products', 'Products', 'products'], ['/admin/brands', 'Brands', 'brands'],
    ['/admin/categories', 'Categories', 'categories'], ['/admin/gallery', 'Gallery', 'gallery'], ['/admin/orders', 'Orders', 'orders'], ['/admin/import', 'Import prices', 'import'], ['/admin/settings', 'Settings', 'settings']];
  return html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Admin</title><meta name="robots" content="noindex">
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/admin.css?v=5"></head>
<body><div class="adm">
<aside class="side">
  <a class="side-name" href="/admin">${s.company_name}</a>
  <nav>${nav.map(([href, label, key]) => html`<a href="${href}" aria-current="${section === key ? 'page' : 'false'}">${label}</a>`)}</nav>
  <div class="side-foot"><a href="/" target="_blank" rel="noopener">View shop</a>
  <form method="post" action="/admin/logout"><button class="linkbtn">Sign out</button></form></div>
</aside>
<main class="main">
  ${flash ? html`<p class="flash">${flash}</p>` : ''}
  ${body}
</main></div>
<script src="/static/admin.js?v=5" defer></script></body></html>`.toString();
}

const flashOf = (url) => ({ saved: 'Saved.', deleted: 'Deleted.', imported: url.searchParams.get('msg') || 'Import finished.', rate: 'Exchange rate refreshed.', samples: 'Sample products removed.' }[url.searchParams.get('ok')] || '');
const opt = (val, label, cur) => html`<option value="${val}" ${String(val) === String(cur ?? '') ? 'selected' : ''}>${label}</option>`;
const check = (name, on, label) => html`<label class="chk"><input type="checkbox" name="${name}" value="1" ${on ? 'checked' : ''}> ${label}</label>`;

// ---------- Auth ----------
const attempts = new Map();
function loginPage(res, error = '') {
  send(res, error ? 401 : 200, html`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — Admin</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/static/admin.css?v=5"></head>
<body class="login"><form method="post" action="/admin/login" class="login-box">
<h1>Shop admin</h1>
${!process.env.ADMIN_PASSWORD ? html`<p class="flash err">ADMIN_PASSWORD is not set on the server. Add it to your .env file and restart.</p>` : ''}
${error ? html`<p class="flash err">${error}</p>` : ''}
<label class="f"><span>Password</span><input type="password" name="password" autofocus required autocomplete="current-password"></label>
<button class="btn">Sign in</button></form></body></html>`.toString());
}
async function doLogin(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const a = (attempts.get(ip) || []).filter((t) => Date.now() - t < 15 * 60e3);
  if (a.length >= 8) return loginPage(res, 'Too many attempts. Wait 15 minutes and try again.');
  const form = await readForm(req);
  if (!checkPassword(form.password)) { a.push(Date.now()); attempts.set(ip, a); return loginPage(res, 'Wrong password.'); }
  attempts.delete(ip);
  redirect(res, '/admin', { 'Set-Cookie': sessionCookie(req, makeSession('admin'), 12 * 3600) });
}

// ---------- Overview ----------
function overview(req, res, url) {
  const counts = db.prepare(`SELECT (SELECT COUNT(*) FROM products) p, (SELECT COUNT(*) FROM products WHERE published=1) pp,
    (SELECT COUNT(*) FROM brands) b, (SELECT COUNT(*) FROM orders WHERE status='awaiting_payment') o, (SELECT COUNT(*) FROM products WHERE sample=1) smp`).get();
  const orders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 8').all();
  const r = currentRate();
  const s = allSettings();
  const missingBank = !s.iban_gel && !s.iban_eur;
  send(res, 200, shell('Overview', html`
    <h1>Overview</h1>
    <p class="mode">Shop mode: <b>${s.ordering_enabled === '1' ? 'Cart and bank-transfer invoices' : 'Estimated prices, quote requests only'}</b> · <a href="/admin/settings#ordering">Change</a></p>
    ${missingBank && s.ordering_enabled === '1' ? html`<p class="flash warn">Add your IBAN and company details in <a href="/admin/settings">Settings</a> — invoices show them to customers.</p>` : ''}
    ${counts.smp ? html`<div class="flash warn row-between"><span>${counts.smp} sample products are loaded so you can see the design. Replace them with your own price list.</span>
      <form method="post" action="/admin/samples/delete" data-confirm="Delete all ${counts.smp} sample products?"><button class="btn btn-small">Delete samples</button></form></div>` : ''}
    <div class="stats">
      <a href="/admin/products"><strong>${counts.pp}</strong><span>published products (${counts.p} total)</span></a>
      <a href="/admin/brands"><strong>${counts.b}</strong><span>brands</span></a>
      <a href="/admin/orders?status=awaiting_payment"><strong>${counts.o}</strong><span>invoices awaiting payment</span></a>
      <a href="/admin/settings#rate"><strong>${r.rate.toFixed(4)}</strong><span>GEL per EUR · ${r.source}</span></a>
    </div>
    <div class="row-between"><h2>Latest invoices</h2><a href="/admin/orders">All orders</a></div>
    ${ordersTable(orders)}
    <p class="actions"><a class="btn" href="/admin/products/new">Add product</a> <a class="btn btn-ghost" href="/admin/brands/new">Add brand</a> <a class="btn btn-ghost" href="/admin/import">Import a price list</a></p>
  `, { flash: flashOf(url), section: '' }));
}

function ordersTable(orders) {
  if (!orders.length) return html`<p class="empty">No invoices yet. When a customer completes the cart, the invoice appears here.</p>`;
  return html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Total</th><th>Status</th></tr></thead><tbody>
  ${orders.map((o) => { const c = JSON.parse(o.customer); return html`<tr>
    <td><a href="/admin/orders/${o.id}">${o.number}</a></td><td>${o.created_at.slice(0, 16)}</td>
    <td>${c.company || c.name}<span class="sub">${c.email}</span></td><td class="num">${fmtMoney(o.total, o.currency)}</td>
    <td><span class="badge b-${o.status}">${STATUS[o.status]}</span></td></tr>`; })}
  </tbody></table></div>`;
}

// ---------- Products ----------
function productsList(req, res, url) {
  const q = url.searchParams.get('q') || '', brand = url.searchParams.get('brand') || '';
  const items = listProducts({ includeHidden: true, q, brand, limit: 2000 });
  const brands = listBrands(true);
  const rate = currentRate().rate;
  send(res, 200, shell('Products', html`
    <div class="row-between"><h1>Products</h1><div><a class="btn btn-ghost" href="/admin/export.csv">Export CSV</a> <a class="btn" href="/admin/products/new">Add product</a></div></div>
    <form class="filterbar" method="get">
      <input type="search" name="q" value="${q}" placeholder="Search name or SKU">
      <select name="brand"><option value="">All brands</option>${brands.map((b) => opt(b.slug, b.name, brand))}</select>
      <button class="btn btn-ghost">Filter</button>
    </form>
    ${items.length ? html`<div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>Product</th><th>Category</th><th class="num">EUR</th><th class="num">GEL</th><th>Availability</th><th>Shown</th></tr></thead><tbody>
    ${items.map((p) => html`<tr>
      <td class="thumb">${p.images[0] ? html`<img src="${p.images[0]}" alt="">` : html`<span class="noimg">no photo</span>`}</td>
      <td><a href="/admin/products/${p.id}">${p.name}</a><span class="sub">${p.brand_name || 'No brand'}${p.sku ? ` · ${p.sku}` : ''}${p.sample ? ' · sample' : ''}</span></td>
      <td>${p.category_name || '—'}</td>
      <td class="num">${Number(p.price_eur) > 0 ? fmtMoney(p.price_eur, 'EUR') : '—'}</td>
      <td class="num">${Number(p.price_eur) > 0 || p.price_gel_fixed ? fmtMoney(gelPrice(p, rate), 'GEL') : '—'}${p.price_gel_fixed ? html`<span class="sub">fixed</span>` : ''}</td>
      <td>${AVAIL[p.availability]}</td>
      <td>${p.published ? (p.featured ? 'Featured' : 'Yes') : html`<span class="muted">Hidden</span>`}</td>
    </tr>`)}</tbody></table></div>` : html`<p class="empty">No products match. <a href="/admin/products/new">Add a product</a> or <a href="/admin/import">import a price list</a>.</p>`}
  `, { flash: flashOf(url), section: 'products' }));
}

function productForm(req, res, url, id) {
  const p = id ? getProduct(id, true) : { availability: 'order', published: 1, images: [] };
  if (!p) return redirect(res, '/admin/products');
  const brands = listBrands(true), cats = listCategories();
  const r = currentRate();
  send(res, 200, shell(id ? p.name : 'New product', html`
    <div class="row-between"><h1>${id ? p.name : 'New product'}</h1>${id && p.published ? html`<a href="/p/${p.slug}" target="_blank" rel="noopener">View on shop</a>` : ''}</div>
    <form method="post" class="form" data-rate="${r.rate}" data-rounding="${allSettings().gel_rounding}">
      <div class="cols">
        <div class="col-main">
          <fieldset><legend>Basics</legend>
            <label class="f"><span>Name</span><input name="name" value="${p.name || ''}" required></label>
            <div class="f-row">
              <label class="f"><span>Brand</span><select name="brand_id"><option value="">—</option>${brands.map((b) => opt(b.id, b.name, p.brand_id))}</select></label>
              <label class="f"><span>Category</span><select name="category_id"><option value="">—</option>${cats.map((c) => opt(c.id, c.name, p.category_id))}</select></label>
              <label class="f"><span>SKU (optional)</span><input name="sku" value="${p.sku || ''}"></label>
            </div>
            <label class="f"><span>Short summary <em>shown under the name</em></span><input name="summary" value="${p.summary || ''}" maxlength="200"></label>
          </fieldset>
          <fieldset><legend>Photos</legend>
            <div class="images" data-images>
              <input type="hidden" name="images" value="${JSON.stringify(p.images || [])}" data-images-field>
              <ul class="img-list" data-img-list></ul>
              <label class="drop" data-drop><input type="file" accept="image/*" multiple data-file> <span>Drop photos here or <u>choose files</u>. The first photo is the main one. Large images are resized automatically.</span></label>
              <p class="muted small" data-upload-status></p>
            </div>
          </fieldset>
          <fieldset><legend>Description</legend>
            <label class="f"><span>Description <em>blank line = new paragraph</em></span><textarea name="description" rows="8">${p.description || ''}</textarea></label>
            <label class="f"><span>Specifications <em>one per line, as “Label: value”</em></span><textarea name="specs" rows="6" placeholder="Channels: 2&#10;Inputs: XLR balanced&#10;Height: 2U">${p.specs || ''}</textarea></label>
          </fieldset>
        </div>
        <div class="col-side">
          <fieldset><legend>Price</legend>
            <label class="f"><span>Price in EUR <em>incl. VAT</em></span><input name="price_eur" value="${p.price_eur || ''}" inputmode="decimal" data-eur></label>
            <p class="muted small" data-gel-preview></p>
            <label class="f"><span>Fixed GEL price <em>optional — overrides the conversion</em></span><input name="price_gel_fixed" value="${p.price_gel_fixed ?? ''}" inputmode="decimal"></label>
            ${check('price_from', p.price_from, 'Show “from” before the price')}
            <label class="f"><span>Options <em>one per line, “Option | EUR price”. The lowest becomes the main price.</em></span><textarea name="variants" rows="5" placeholder="90s black | 1699&#10;80s grey, 70s white | 1299">${p.variants || ''}</textarea></label>
            <p class="muted small">Leave the prices and options empty to show “Price on request”.</p>
          </fieldset>
          <fieldset><legend>Availability</legend>
            <label class="f"><span>Status</span><select name="availability">${Object.entries(AVAIL).map(([k, v]) => opt(k, v, p.availability))}</select></label>
            <label class="f"><span>Delivery time <em>e.g. 3–5 weeks</em></span><input name="lead_time" value="${p.lead_time || ''}"></label>
          </fieldset>
          <fieldset><legend>Visibility</legend>
            ${check('published', p.published, 'Show on the shop')}
            ${check('featured', p.featured, 'Feature on the home page')}
            <label class="f"><span>Sort order <em>lower comes first</em></span><input name="sort" value="${p.sort || 0}" inputmode="numeric"></label>
            ${id ? html`<label class="f"><span>Web address</span><input name="slug" value="${p.slug}"></label>` : ''}
          </fieldset>
          <div class="sticky-actions"><button class="btn">${id ? 'Save changes' : 'Create product'}</button></div>
        </div>
      </div>
    </form>
    ${id ? html`<form method="post" action="/admin/products/${id}/delete" class="danger" data-confirm="Delete ${p.name}? This can't be undone."><button class="btn btn-danger">Delete product</button></form>` : ''}
  `, { flash: flashOf(url), section: 'products' }));
}

const num = (v) => { const n = parsePrice(v); return n > 0 ? n : 0; };
const intOr = (v, d = 0) => Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d;

async function productSave(req, res, id) {
  const f = await readForm(req);
  let images = [];
  try { images = JSON.parse(f.images || '[]').filter((s) => typeof s === 'string' && s.startsWith('/uploads/')).slice(0, 20); } catch {}
  const gelFixed = String(f.price_gel_fixed || '').trim() ? num(f.price_gel_fixed) || null : null;
  const row = {
    name: String(f.name || '').trim() || 'Untitled', brand_id: intOr(f.brand_id, 0) || null, category_id: intOr(f.category_id, 0) || null,
    sku: f.sku || '', price_eur: num(f.price_eur), price_gel_fixed: gelFixed, price_from: f.price_from ? 1 : 0,
    availability: AVAIL[f.availability] ? f.availability : 'order', lead_time: f.lead_time || '',
    summary: f.summary || '', description: f.description || '',
    specs: f.specs || '', images: JSON.stringify(images), featured: f.featured ? 1 : 0, published: f.published ? 1 : 0, sort: intOr(f.sort),
    variants: String(f.variants || '').trim(),
  };
  const vl = parseVariants(row.variants).filter((v) => v.price > 0);
  if (vl.length) {
    row.price_eur = Math.min(...vl.map((v) => v.price));
    if (vl.length > 1 && new Set(vl.map((v) => v.price)).size > 1) row.price_from = 1;
  }
  if (id) {
    row.slug = uniqueSlug('products', f.slug || row.name, id);
    const keys = Object.keys(row);
    db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')}, sample = 0, updated_at = datetime('now') WHERE id = ?`).run(...keys.map((k) => row[k]), id);
  } else {
    row.slug = uniqueSlug('products', row.name);
    const keys = Object.keys(row);
    const r = db.prepare(`INSERT INTO products(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`).run(...keys.map((k) => row[k]));
    id = Number(r.lastInsertRowid);
  }
  redirect(res, `/admin/products/${id}?ok=saved`);
}

// ---------- Brands ----------
function brandsList(req, res, url) {
  const brands = listBrands(true);
  send(res, 200, shell('Brands', html`
    <div class="row-between"><h1>Brands</h1><a class="btn" href="/admin/brands/new">Add brand</a></div>
    <div class="table-wrap"><table class="tbl"><thead><tr><th>Brand</th><th>Origin</th><th class="num">Products</th><th>Shown</th></tr></thead><tbody>
    ${brands.map((b) => html`<tr><td><a href="/admin/brands/${b.id}">${b.name}</a></td><td>${b.origin}</td><td class="num">${b.product_count}</td><td>${b.published ? 'Yes' : html`<span class="muted">Hidden</span>`}</td></tr>`)}
    </tbody></table></div>`, { flash: flashOf(url), section: 'brands' }));
}
function brandForm(req, res, url, id) {
  const b = id ? db.prepare('SELECT * FROM brands WHERE id = ?').get(id) : { published: 1 };
  if (!b) return redirect(res, '/admin/brands');
  const imgField = (name, label, hint) => html`<div class="f single-img" data-single>
    <span>${label} <em>${hint}</em></span>
    <input type="hidden" name="${name}" value="${b[name] || ''}" data-single-field>
    <div class="single-preview" data-single-preview>${b[name] ? html`<img src="${b[name]}" alt="">` : ''}</div>
    <label class="drop small"><input type="file" accept="image/*" data-single-file> <span>Choose image</span></label>
    <button type="button" class="linkbtn" data-single-clear>Remove image</button>
  </div>`;
  send(res, 200, shell(id ? b.name : 'New brand', html`
    <h1>${id ? b.name : 'New brand'}</h1>
    <form method="post" class="form narrow">
      <label class="f"><span>Name</span><input name="name" value="${b.name || ''}" required></label>
      <label class="f"><span>Origin <em>e.g. Handmade in Aarhus, Denmark</em></span><input name="origin" value="${b.origin || ''}"></label>
      <label class="f"><span>Tagline <em>one sentence on the home page</em></span><input name="tagline" value="${b.tagline || ''}"></label>
      <label class="f"><span>About the brand</span><textarea name="description" rows="6">${b.description || ''}</textarea></label>
      <label class="f"><span>Manufacturer website</span><input name="website" value="${b.website || ''}" placeholder="https://"></label>
      ${imgField('logo', 'Logo', 'shown on the brand page — SVG or PNG with transparent background')}
      ${imgField('hero', 'Large photo', 'used on the home page and brand page')}
      <div class="f-row"><label class="f"><span>Sort order</span><input name="sort" value="${b.sort || 0}"></label></div>
      ${check('published', b.published, 'Show on the shop')}
      <p><button class="btn">${id ? 'Save changes' : 'Create brand'}</button></p>
    </form>
    ${id ? html`<form method="post" action="/admin/brands/${id}/delete" class="danger" data-confirm="Delete ${b.name}? Its products stay, but lose their brand."><button class="btn btn-danger">Delete brand</button></form>` : ''}
  `, { flash: flashOf(url), section: 'brands' }));
}
async function brandSave(req, res, id) {
  const f = await readForm(req);
  const img = (v) => (typeof v === 'string' && v.startsWith('/uploads/') ? v : '');
  const row = { name: String(f.name || '').trim() || 'Brand', origin: f.origin || '', tagline: f.tagline || '',
    description: f.description || '', website: /^https?:\/\//.test(f.website || '') ? f.website : '',
    logo: img(f.logo), hero: img(f.hero), sort: intOr(f.sort), published: f.published ? 1 : 0 };
  row.slug = uniqueSlug('brands', row.name, id || 0);
  const keys = Object.keys(row);
  if (id) db.prepare(`UPDATE brands SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => row[k]), id);
  else id = Number(db.prepare(`INSERT INTO brands(${keys}) VALUES(${keys.map(() => '?')})`).run(...keys.map((k) => row[k])).lastInsertRowid);
  redirect(res, `/admin/brands/${id}?ok=saved`);
}

// ---------- Categories ----------
function categoriesPage(req, res, url) {
  const cats = listCategories();
  send(res, 200, shell('Categories', html`
    <h1>Categories</h1>
    <p class="muted">The type decides which drawing a product shows until it has photos.</p>
    <div class="table-wrap"><table class="tbl cats"><thead><tr><th>Name</th><th>Type</th><th>Sort</th><th class="num">Products</th><th></th></tr></thead><tbody>
    ${cats.map((c) => html`<tr><td colspan="6"><form method="post" action="/admin/categories/${c.id}" class="cat-row">
      <input name="name" value="${c.name}" aria-label="Name" required>
      <select name="kind" aria-label="Type">${Object.entries(KINDS).map(([k, v]) => opt(k, v, c.kind))}</select>
      <input name="sort" value="${c.sort}" aria-label="Sort" class="w-s">
      <span class="num">${c.product_count}</span>
      <span><button class="btn btn-small">Save</button> <button class="btn btn-small btn-danger" formaction="/admin/categories/${c.id}/delete" data-confirm-btn="Delete ${c.name}?">Delete</button></span>
    </form></td></tr>`)}
    </tbody></table></div>
    <h2>Add category</h2>
    <form method="post" action="/admin/categories/new" class="cat-row">
      <input name="name" placeholder="Name" required aria-label="Name">
      <select name="kind" aria-label="Type">${Object.entries(KINDS).map(([k, v]) => opt(k, v, 'gear'))}</select>
      <input name="sort" value="0" class="w-s" aria-label="Sort"><span></span><span><button class="btn btn-small">Add</button></span>
    </form>`, { flash: flashOf(url), section: 'categories' }));
}
async function categorySave(req, res, id) {
  const f = await readForm(req);
  const kind = KINDS[f.kind] ? f.kind : 'gear';
  const name = String(f.name || '').trim() || 'Category';
  if (id) db.prepare('UPDATE categories SET name=?, kind=?, sort=?, slug=? WHERE id=?').run(name, kind, intOr(f.sort), uniqueSlug('categories', name, id), id);
  else db.prepare('INSERT INTO categories(name, kind, sort, slug) VALUES(?,?,?,?)').run(name, kind, intOr(f.sort), uniqueSlug('categories', name));
  redirect(res, '/admin/categories?ok=saved');
}

// ---------- Orders ----------
function ordersList(req, res, url) {
  const st = url.searchParams.get('status') || '';
  const orders = st ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC').all(st) : db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all();
  send(res, 200, shell('Orders', html`
    <h1>Orders</h1>
    <div class="chips"><a href="/admin/orders" aria-current="${!st}">All</a>${Object.entries(STATUS).map(([k, v]) => html`<a href="/admin/orders?status=${k}" aria-current="${st === k}">${v}</a>`)}</div>
    ${ordersTable(orders)}`, { flash: flashOf(url), section: 'orders' }));
}
function orderView(req, res, url, id) {
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!o) return redirect(res, '/admin/orders');
  const c = JSON.parse(o.customer), items = JSON.parse(o.items);
  send(res, 200, shell(o.number, html`
    <div class="row-between"><h1>${o.number}</h1><div><a class="btn btn-ghost" href="/admin/orders/${o.id}/invoice">Open invoice</a></div></div>
    <div class="cols">
      <div class="col-main">
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th></tr></thead><tbody>
        ${items.map((i) => html`<tr><td>${i.name}</td><td class="num">${i.qty}</td><td class="num">${fmtMoney(i.unit, o.currency)}</td><td class="num">${fmtMoney(i.total, o.currency)}</td></tr>`)}
        <tr class="tot"><td colspan="3">Total</td><td class="num">${fmtMoney(o.total, o.currency)}</td></tr></tbody></table></div>
        <p class="muted small">Rate locked at 1 EUR = ${o.rate.toFixed(4)} GEL (${o.rate_source}). Created ${o.created_at} UTC, pay by ${o.due_at || '—'}.</p>
        <h2>Customer</h2>
        <dl class="dl">
          <dt>Type</dt><dd>${c.type === 'company' ? 'Company' : 'Private person'}</dd>
          ${c.company ? html`<dt>Company</dt><dd>${c.company}</dd>` : ''}
          <dt>Name</dt><dd>${c.name}</dd><dt>ID code</dt><dd>${c.id_code || '—'}</dd>
          <dt>Email</dt><dd><a href="mailto:${c.email}?subject=${encodeURIComponent(o.number)}">${c.email}</a></dd>
          <dt>Phone</dt><dd><a href="tel:${c.phone}">${c.phone}</a></dd>
          <dt>Address</dt><dd>${[c.address, c.city].filter(Boolean).join(', ') || '—'}</dd>
          ${c.notes ? html`<dt>Notes</dt><dd>${c.notes}</dd>` : ''}
        </dl>
        <p class="muted small">Customer's invoice link (you can send it to them): <input class="copy" readonly value="/invoice/${o.token}" data-abs></p>
      </div>
      <div class="col-side">
        <form method="post" class="form">
          <fieldset><legend>Status</legend>
            <label class="f"><select name="status">${Object.entries(STATUS).map(([k, v]) => opt(k, v, o.status))}</select></label>
            <label class="f"><span>Internal note</span><textarea name="admin_note" rows="4">${o.admin_note || ''}</textarea></label>
            <button class="btn">Save</button>
          </fieldset>
        </form>
      </div>
    </div>
    <form method="post" action="/admin/orders/${o.id}/delete" class="danger" data-confirm="Delete invoice ${o.number}? The customer's link will stop working."><button class="btn btn-danger">Delete invoice</button></form>
  `, { flash: flashOf(url), section: 'orders' }));
}

// ---------- Import / export ----------
const CSV_COLS = ['name', 'brand', 'category', 'sku', 'price_eur', 'price_gel', 'from', 'options', 'availability', 'lead_time', 'summary', 'description', 'specs', 'featured', 'published'];
function importPage(req, res, url, result = null) {
  send(res, 200, shell('Import prices', html`
    <h1>Import a price list</h1>
    <p>Upload a CSV saved from Excel or Google Sheets. Existing products are matched by SKU, or by brand and name, and updated; new rows become new products. Missing brands and categories are created.</p>
    <p class="muted small">Columns (only <b>name</b> is required): ${CSV_COLS.join(', ')}. Availability: in_stock, order, preorder, on_request. Options: “Option | price” entries separated by semicolons. Prices like 4.499,00 or 4,499.00 both work. Start from <a href="/admin/export.csv">an export of your current products</a>.</p>
    ${result ? html`<div class="flash">${result}</div>` : ''}
    <form method="post" class="form narrow" data-csv-form>
      <label class="drop"><input type="file" accept=".csv,text/csv,.tsv,.txt" data-csv-file> <span>Choose a CSV file</span></label>
      <label class="f"><span>…or paste the rows here</span><textarea name="csv" rows="10" data-csv-text placeholder="name,brand,category,price_eur&#10;G25 VocalShape,Gyraf Audio,Equalizers,4499"></textarea></label>
      ${check('hide_missing', false, 'Hide products of the imported brands that are not in this file')}
      <p><button class="btn">Import</button></p>
    </form>`, { section: 'import' }));
}
async function doImport(req, res, url) {
  const f = await readForm(req);
  const rows = parseCsv(f.csv || '');
  let created = 0, updated = 0, skipped = 0;
  const brandId = (name) => {
    if (!name) return null;
    const b = db.prepare('SELECT id FROM brands WHERE lower(name) = lower(?)').get(name);
    return b ? b.id : Number(db.prepare('INSERT INTO brands(name, slug, sort) VALUES(?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM brands))').run(name, uniqueSlug('brands', name)).lastInsertRowid);
  };
  const catId = (name) => {
    if (!name) return null;
    const c = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?) ').get(name);
    return c ? c.id : Number(db.prepare('INSERT INTO categories(name, slug, sort) VALUES(?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM categories))').run(name, uniqueSlug('categories', name)).lastInsertRowid);
  };
  const yes = (v, d) => (v === undefined || v === '' ? d : /^(1|y|yes|true|x|კი)$/i.test(v) ? 1 : 0);
  const touched = new Map(); // brand id -> Set(product ids)
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const name = r.name || r.product || r.title;
      if (!name) { skipped++; continue; }
      const bId = brandId(r.brand), cId = catId(r.category);
      let existing = r.sku ? db.prepare('SELECT * FROM products WHERE sku = ? AND sku != ""').get(r.sku) : null;
      if (!existing) existing = db.prepare('SELECT * FROM products WHERE lower(name) = lower(?) AND (brand_id IS ? OR brand_id = ?)').get(name, bId, bId);
      const avail = AVAIL[r.availability] ? r.availability : (existing?.availability || 'order');
      const data = {
        name, brand_id: bId ?? existing?.brand_id ?? null, category_id: cId ?? existing?.category_id ?? null, sku: r.sku ?? existing?.sku ?? '',
        price_eur: r.price_eur !== undefined && r.price_eur !== '' ? parsePrice(r.price_eur) : (existing?.price_eur ?? 0),
        price_gel_fixed: r.price_gel ? parsePrice(r.price_gel) || null : (existing?.price_gel_fixed ?? null),
        price_from: yes(r.from, existing?.price_from ?? 0), availability: avail, lead_time: r.lead_time ?? existing?.lead_time ?? '',
        summary: r.summary || existing?.summary || '', description: r.description || existing?.description || '', specs: (r.specs || existing?.specs || '').replace(/\s*\|\s*/g, '\n'),
        featured: yes(r.featured, existing?.featured ?? 0), published: yes(r.published, existing ? existing.published : 1),
        variants: r.options !== undefined && r.options !== '' ? r.options.split(/\s*;\s*/).join('\n') : (existing?.variants ?? ''),
      };
      const vl = parseVariants(data.variants).filter((v) => v.price > 0);
      if (vl.length && !(r.price_eur)) { data.price_eur = Math.min(...vl.map((v) => v.price)); if (new Set(vl.map((v) => v.price)).size > 1) data.price_from = 1; }
      const keys = Object.keys(data);
      let pid;
      if (existing) {
        db.prepare(`UPDATE products SET ${keys.map((k) => `${k}=?`).join(',')}, sample=0, updated_at=datetime('now') WHERE id=?`).run(...keys.map((k) => data[k]), existing.id);
        pid = existing.id; updated++;
      } else {
        data.slug = uniqueSlug('products', `${r.brand ? r.brand.split(' ')[0] + ' ' : ''}${name}`);
        const k2 = Object.keys(data);
        pid = Number(db.prepare(`INSERT INTO products(${k2}) VALUES(${k2.map(() => '?')})`).run(...k2.map((k) => data[k])).lastInsertRowid);
        created++;
      }
      if (data.brand_id) { if (!touched.has(data.brand_id)) touched.set(data.brand_id, new Set()); touched.get(data.brand_id).add(pid); }
    }
    let hidden = 0;
    if (f.hide_missing) for (const [bid, ids] of touched) {
      hidden += Number(db.prepare(`UPDATE products SET published = 0 WHERE brand_id = ? AND id NOT IN (${[...ids].join(',') || 0})`).run(bid).changes);
    }
    db.exec('COMMIT');
    const msg = `Import finished: ${created} new, ${updated} updated${skipped ? `, ${skipped} rows without a name skipped` : ''}${hidden ? `, ${hidden} hidden` : ''}.`;
    redirect(res, `/admin/products?ok=imported&msg=${encodeURIComponent(msg)}`);
  } catch (e) {
    db.exec('ROLLBACK');
    importPage(req, res, url, `Import failed: ${e.message}. Nothing was changed.`);
  }
}
function exportCsv(req, res) {
  const rows = listProducts({ includeHidden: true, limit: 10000 }).map((p) => ({
    name: p.name, brand: p.brand_name || '', category: p.category_name || '', sku: p.sku, price_eur: p.price_eur || '', price_gel: p.price_gel_fixed ?? '',
    from: p.price_from ? 'yes' : '', options: String(p.variants || '').split('\n').filter(Boolean).join(' ; '), availability: p.availability, lead_time: p.lead_time, summary: p.summary, description: p.description,
    specs: String(p.specs || '').split('\n').join(' | '), featured: p.featured ? 'yes' : 'no', published: p.published ? 'yes' : 'no',
  }));
  send(res, 200, toCsv(rows, CSV_COLS), { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"` });
}

// ---------- Settings ----------
function settingsPage(req, res, url) {
  const s = allSettings(), r = currentRate();
  const t = (k, label, hint = '', attrs = '') => html`<label class="f"><span>${label}${hint ? html` <em>${hint}</em>` : ''}</span><input name="${k}" value="${s[k]}" ${raw(attrs)}></label>`;
  const ta = (k, label, hint = '', ka = false) => html`<label class="f"><span>${label}${hint ? html` <em>${hint}</em>` : ''}</span><textarea name="${k}" rows="3" ${ka ? raw('lang="ka"') : ''}>${s[k]}</textarea></label>`;
  send(res, 200, shell('Settings', html`
    <h1>Settings</h1>
    <form method="post" class="form narrow">
      <fieldset><legend>Company <em>printed on every invoice</em></legend>
        ${t('company_name', 'Shop name', 'shown in the header')}
        ${t('company_legal', 'Legal name', 'e.g. შპს Audio House')}
        ${t('company_id', 'Company ID code', 'საიდენტიფიკაციო კოდი')}
        ${t('company_address', 'Address')}
        ${t('site_url', 'Website address', 'used for links shared on social media and search engines')}
        <div class="f-row">${t('company_email', 'Email')}${t('company_phone', 'Phone')}</div>
        <div class="f-row">${t('company_whatsapp', 'WhatsApp number', 'with country code, e.g. 995555123456')}${t('company_instagram', 'Instagram link')}</div>
      </fieldset>
      <fieldset><legend>Bank details</legend>
        <div class="f-row">${t('bank_name', 'Bank')}${t('bank_swift', 'SWIFT / BIC')}</div>
        ${t('bank_beneficiary', 'Beneficiary name', 'leave blank to use the legal name')}
        ${t('iban_gel', 'IBAN for GEL payments', '', 'placeholder="GE00BG0000000000000000" class="mono"')}
        ${t('iban_eur', 'IBAN for EUR payments', 'often the same multi-currency account', 'placeholder="GE00BG0000000000000000" class="mono"')}
      </fieldset>
      <fieldset id="ordering"><legend>Online ordering</legend>
        <label class="f"><span>What customers can do</span><select name="ordering_enabled">${opt('0', 'Show estimated prices and ask for a quote (no cart)', s.ordering_enabled)}${opt('1', 'Add to cart and create a bank-transfer invoice', s.ordering_enabled)}</select></label>
        <p class="muted small">With quotes only, the cart and checkout are hidden and prices are labelled as estimates. Customers contact you by WhatsApp, email or phone — fill those in under Company.</p>
      </fieldset>
      <fieldset><legend>Invoices <em>used when ordering is switched on</em></legend>
        <div class="f-row">${t('invoice_prefix', 'Number prefix', 'INV → INV-2026-0001')}${t('invoice_valid_days', 'Days to pay')}</div>
        <div class="f-row">
          <label class="f"><span>VAT</span><select name="vat_payer">${opt('1', 'Registered — prices include VAT', s.vat_payer)}${opt('0', 'Not a VAT payer', s.vat_payer)}</select></label>
          ${t('vat_rate', 'VAT rate %')}
        </div>
        ${ta('invoice_note', 'Note at the bottom of the invoice')}
      </fieldset>
      <fieldset id="rate"><legend>Exchange rate</legend>
        <p class="muted small">Now: 1 EUR = <b>${r.rate.toFixed(4)}</b> GEL — ${r.source}${r.markup ? `, plus ${r.markup}% markup on ${r.base.toFixed(4)}` : ''}${r.at ? `, fetched ${new Date(r.at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : ''}. ${s.rate_error && r.source.includes('unavailable') ? html`<span class="err">Last error: ${s.rate_error}</span>` : ''}</p>
        <div class="f-row">
          <label class="f"><span>Source</span><select name="rate_mode">${opt('bog', 'Bank of Georgia (commercial sell rate)', s.rate_mode)}${opt('nbg', 'National Bank of Georgia (official)', s.rate_mode)}${opt('manual', 'Fixed rate I set myself', s.rate_mode)}</select></label>
          ${t('rate_manual', 'Fixed rate', 'used when source is “fixed”, or if the bank is unreachable')}
        </div>
        <div class="f-row">
          ${t('rate_markup', 'Markup %', 'added on top, e.g. 1.5 to cover transfer costs')}
          <label class="f"><span>Round GEL prices up to</span><select name="gel_rounding">${['1', '5', '10', '50'].map((v) => opt(v, `${v} ₾`, s.gel_rounding))}</select></label>
          <label class="f"><span>Default currency</span><select name="default_currency">${opt('GEL', 'GEL', s.default_currency)}${opt('EUR', 'EUR', s.default_currency)}</select></label>
        </div>
        <button class="btn btn-ghost btn-small" formaction="/admin/settings/refresh-rate">Refresh rate now</button>
      </fieldset>
      <fieldset><legend>Home page</legend>
        ${t('hero_title', 'Headline')}
        ${ta('hero_text', 'Intro')}
      </fieldset>
      <p class="sticky-actions"><button class="btn">Save settings</button></p>
    </form>`, { flash: flashOf(url), section: 'settings' }));
}
async function settingsSave(req, res) {
  const f = await readForm(req);
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in f) setSetting(k, String(f[k]).trim());
  setSetting('rate_cache_at', 0); // re-fetch with the new source
  await refreshRate(true);
  redirect(res, '/admin/settings?ok=saved');
}

// ---------- Studio gallery ----------
function galleryAdmin(req, res, url) {
  const items = listGallery(true);
  send(res, 200, shell('Gallery', html`
    <div class="row-between"><h1>Studio gallery</h1><a href="/gallery" target="_blank" rel="noopener">View gallery</a></div>
    <p class="muted">Photos shown on the Gallery page, in this order. Lower sort numbers come first.</p>
    <form method="post" action="/admin/gallery/add" class="form narrow" data-gallery-add>
      <input type="hidden" name="images" data-gallery-images>
      <label class="drop"><input type="file" accept="image/*" multiple data-gallery-file> <span>Add photos — drop them here or <u>choose files</u>. Large photos are resized automatically.</span></label>
      <p class="muted small" data-gallery-status></p>
    </form>
    ${items.length ? html`<div class="gal-grid">${items.map((g) => html`<form method="post" action="/admin/gallery/${g.id}" class="gal-item">
      <img src="${g.image}" alt="" loading="lazy">
      <label class="f"><span>Caption</span><input name="caption" value="${g.caption}"></label>
      <label class="f"><span>Credit</span><input name="credit" value="${g.credit}" placeholder="@photographer"></label>
      <div class="f-row"><label class="f"><span>Sort</span><input name="sort" value="${g.sort}" inputmode="numeric"></label></div>
      ${check('published', g.published, 'Show')}
      <div class="gal-actions"><button class="btn btn-small">Save</button>
      <button class="btn btn-small btn-danger" formaction="/admin/gallery/${g.id}/delete" data-confirm-btn="Remove this photo from the gallery?">Remove</button></div>
    </form>`)}</div>` : html`<p class="empty">No photos yet. Add some above.</p>`}
  `, { flash: flashOf(url), section: 'gallery' }));
}

// ---------- Uploads ----------
function sniff(buf) {
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.slice(1, 4).toString('ascii') === 'PNG') return 'png';
  if (buf.slice(0, 6).toString('ascii').startsWith('GIF8')) return 'gif';
  const head = buf.slice(0, 300).toString('utf8');
  if (/<svg[\s>]/i.test(head) || (/^\s*<\?xml/.test(head) && /<svg/i.test(buf.toString('utf8')))) return 'svg';
  return null;
}
async function upload(req, res) {
  const buf = await readBody(req, 15e6);
  let ext = sniff(buf);
  if (!ext) return sendJson(res, 415, { error: 'Only JPEG, PNG, WebP, GIF or SVG images can be uploaded.' });
  if (ext === 'svg') {
    const s = buf.toString('utf8');
    if (/<script|on\w+\s*=|javascript:|<foreignObject/i.test(s)) return sendJson(res, 415, { error: 'This SVG contains scripts and was rejected.' });
  }
  const name = `${crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16)}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
  sendJson(res, 200, { url: `/uploads/${name}` });
}

// ---------- Router ----------
export async function adminRoutes(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/admin')) return false;
  if (p === '/admin/login') {
    if (req.method === 'POST') await doLogin(req, res); else loginPage(res);
    return true;
  }
  const session = readSession(req);
  if (!session) { if (req.method === 'GET') redirect(res, '/admin/login'); else send(res, 401, 'Signed out'); return true; }
  if (req.method === 'POST' && !sameOrigin(req)) { send(res, 403, 'Cross-origin request blocked'); return true; }
  const G = req.method === 'GET', P = req.method === 'POST';
  let m;
  if (P && p === '/admin/logout') return redirect(res, '/admin/login', { 'Set-Cookie': sessionCookie(req, '', 0) }), true;
  if (G && (p === '/admin' || p === '/admin/')) return overview(req, res, url), true;
  if (G && p === '/admin/products') return productsList(req, res, url), true;
  if (p === '/admin/products/new') return (G ? productForm(req, res, url, 0) : await productSave(req, res, 0)), true;
  if ((m = p.match(/^\/admin\/products\/(\d+)$/))) return (G ? productForm(req, res, url, +m[1]) : await productSave(req, res, +m[1])), true;
  if (P && (m = p.match(/^\/admin\/products\/(\d+)\/delete$/))) { db.prepare('DELETE FROM products WHERE id = ?').run(+m[1]); return redirect(res, '/admin/products?ok=deleted'), true; }
  if (P && p === '/admin/samples/delete') { db.prepare('DELETE FROM products WHERE sample = 1').run(); return redirect(res, '/admin?ok=samples'), true; }
  if (G && p === '/admin/brands') return brandsList(req, res, url), true;
  if (p === '/admin/brands/new') return (G ? brandForm(req, res, url, 0) : await brandSave(req, res, 0)), true;
  if ((m = p.match(/^\/admin\/brands\/(\d+)$/))) return (G ? brandForm(req, res, url, +m[1]) : await brandSave(req, res, +m[1])), true;
  if (P && (m = p.match(/^\/admin\/brands\/(\d+)\/delete$/))) { db.prepare('DELETE FROM brands WHERE id = ?').run(+m[1]); return redirect(res, '/admin/brands?ok=deleted'), true; }
  if (G && p === '/admin/categories') return categoriesPage(req, res, url), true;
  if (P && p === '/admin/categories/new') return await categorySave(req, res, 0), true;
  if (P && (m = p.match(/^\/admin\/categories\/(\d+)$/))) return await categorySave(req, res, +m[1]), true;
  if (P && (m = p.match(/^\/admin\/categories\/(\d+)\/delete$/))) { db.prepare('DELETE FROM categories WHERE id = ?').run(+m[1]); return redirect(res, '/admin/categories?ok=deleted'), true; }
  if (G && p === '/admin/orders') return ordersList(req, res, url), true;
  if ((m = p.match(/^\/admin\/orders\/(\d+)$/))) {
    if (P) { const f = await readForm(req); db.prepare('UPDATE orders SET status = ?, admin_note = ? WHERE id = ?').run(STATUS[f.status] ? f.status : 'awaiting_payment', f.admin_note || '', +m[1]); return redirect(res, `/admin/orders/${m[1]}?ok=saved`), true; }
    return orderView(req, res, url, +m[1]), true;
  }
  if (G && (m = p.match(/^\/admin\/orders\/(\d+)\/invoice$/))) {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(+m[1]);
    if (!o) return redirect(res, '/admin/orders'), true;
    return send(res, 200, invoicePage({ lang: 'en', t: translator('en') }, o, { admin: true })), true;
  }
  if (P && (m = p.match(/^\/admin\/orders\/(\d+)\/delete$/))) { db.prepare('DELETE FROM orders WHERE id = ?').run(+m[1]); return redirect(res, '/admin/orders?ok=deleted'), true; }
  if (p === '/admin/import') return (G ? importPage(req, res, url) : await doImport(req, res, url)), true;
  if (G && p === '/admin/export.csv') return exportCsv(req, res), true;
  if (p === '/admin/settings') return (G ? settingsPage(req, res, url) : await settingsSave(req, res)), true;
  if (P && p === '/admin/settings/refresh-rate') {
    const f = await readForm(req);
    for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in f) setSetting(k, String(f[k]).trim());
    await refreshRate(true); return redirect(res, '/admin/settings?ok=rate#rate'), true;
  }
  if (P && p === '/admin/upload') return await upload(req, res), true;
  if (G && p === '/admin/gallery') return galleryAdmin(req, res, url), true;
  if (P && p === '/admin/gallery/add') {
    const f = await readForm(req);
    let imgs = []; try { imgs = JSON.parse(f.images || '[]'); } catch {}
    const max = db.prepare('SELECT COALESCE(MAX(sort), 0) m FROM gallery').get().m;
    const ins = db.prepare('INSERT INTO gallery(image, caption, credit, sort) VALUES(?,?,?,?)');
    imgs.filter((s) => typeof s === 'string' && s.startsWith('/uploads/')).forEach((img, i) => ins.run(img, '', '', max + 1 + i));
    return redirect(res, '/admin/gallery?ok=saved'), true;
  }
  if (P && (m = p.match(/^\/admin\/gallery\/(\d+)$/))) {
    const f = await readForm(req);
    db.prepare('UPDATE gallery SET caption = ?, credit = ?, sort = ?, published = ? WHERE id = ?').run(f.caption || '', f.credit || '', intOr(f.sort), f.published ? 1 : 0, +m[1]);
    return redirect(res, '/admin/gallery?ok=saved'), true;
  }
  if (P && (m = p.match(/^\/admin\/gallery\/(\d+)\/delete$/))) { db.prepare('DELETE FROM gallery WHERE id = ?').run(+m[1]); return redirect(res, '/admin/gallery?ok=deleted'), true; }
  return false;
}
export { slugify };
