// Storefront pages.
import crypto from 'node:crypto';
import { html, raw, send, sendJson, redirect, readForm, esc } from './http.js';
import { db, listProducts, getProduct, listBrands, getBrand, listCategories, getSetting, listGallery } from './db.js';
import { ctx, page, priceBlock, fmtMoney } from './layout.js';
import { loc } from './i18n.js';
import { placeholderSvg } from './placeholder.js';
import { priceIn, listPriceIn, discountPct, currentRate, gelPrice } from './rates.js';
import { invoicePage } from './invoice.js';

const AVAIL = ['in_stock', 'order', 'preorder', 'on_request'];

function media(p, cls = '') {
  const img = p.images?.[0];
  return img
    ? html`<img class="${cls}" src="${img}" alt="${p.name}" loading="lazy" decoding="async">`
    : raw(placeholderSvg(p));
}

function card(c, p) {
  return html`<article class="card">
    <a class="card-media" href="/p/${p.slug}" tabindex="-1" aria-hidden="true">${media(p)}</a>
    <div class="card-body">
      <p class="card-brand">${p.brand_name || ''}</p>
      <h3 class="card-title"><a href="/p/${p.slug}">${p.name}</a></h3>
      <p class="card-meta"><span class="avail avail-${p.availability}">${c.t(p.availability)}</span></p>
      ${priceBlock(c, p)}
    </div>
  </article>`;
}
const grid = (c, items) => html`<div class="grid">${items.map((p) => card(c, p))}</div>`;

// ---------- Home ----------
function home(req, res) {
  const c = ctx(req);
  const brands = listBrands();
  // Products with real photos lead the page; drawn placeholders follow.
  let featured = listProducts({ featured: true, limit: 8 }).sort((a, b) => (b.images.length > 0) - (a.images.length > 0));
  // Fill the grid to full rows of four with other photographed products.
  if (featured.length % 4) {
    const extra = listProducts({ limit: 200 }).filter((p) => p.images.length && !featured.some((f) => f.id === p.id));
    while (featured.length % 4 && extra.length) featured.push(extra.shift());
    if (featured.length > 4 && featured.length % 4) featured = featured.slice(0, featured.length - (featured.length % 4));
  }
  const lead = featured[0] || listProducts({ limit: 1 })[0];
  const body = html`
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <h1 class="display">${loc(c.s, 'hero_title', c.lang)}</h1>
        <p class="lede">${loc(c.s, 'hero_text', c.lang)}</p>
        <p class="hero-actions"><a class="btn" href="/catalog">${c.t('view_catalog')}</a></p>
      </div>
      ${lead ? html`<a class="hero-unit" href="/p/${lead.slug}">
        <div class="hero-media">${media(lead)}</div>
        <div class="hero-caption"><span>${lead.brand_name} ${lead.name}</span>${priceBlock(c, lead)}</div>
      </a>` : ''}
    </div>
  </section>

  <section class="brands wrap" aria-label="${c.t('brands')}">
    ${brands.map((b) => { const pool = listProducts({ brand: b.slug, limit: 50 }); const lead = pool.find((x) => x.images.length && x.featured) || pool.find((x) => x.images.length) || pool[0]; return html`<a class="brand-panel" href="${b.product_count === 0 ? '/gallery' : `/brands/${b.slug}`}">
      ${b.hero ? html`<img class="brand-panel-bg" src="${b.hero}" alt="" loading="lazy">` : lead ? html`<div class="brand-panel-unit">${media(lead)}</div>` : ''}
      <div class="brand-panel-text">
        <h2>${b.name}</h2>
        <p class="brand-origin">${b.origin}</p>
        <p>${loc(b, 'tagline', c.lang)}</p>
        <span class="link">${b.product_count === 0 ? 'See it in real studios' : b.product_count === 1 ? c.t('products_1') : c.t('products_n', { n: b.product_count })}</span>
      </div>
    </a>`; })}
  </section>

  ${featured.length ? html`<section class="wrap section">
    <div class="section-head"><h2>Selected units</h2><a class="link" href="/catalog">${c.t('all_products')}</a></div>
    ${grid(c, featured)}
  </section>` : ''}`;
  send(res, 200, page(c, { body }));
}

// ---------- Catalog ----------
function catalog(req, res, url) {
  const c = ctx(req);
  const brand = url.searchParams.get('brand') || '';
  const category = url.searchParams.get('category') || '';
  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const items = listProducts({ brand, category, q });
  const brands = listBrands();
  const cats = listCategories().filter((x) => x.product_count > 0);
  const chip = (key, val, label, active) => {
    const p = new URLSearchParams(url.searchParams);
    if (val) p.set(key, val); else p.delete(key);
    return html`<a class="chip" href="/catalog${p.toString() ? '?' + p : ''}" aria-current="${active}">${label}</a>`;
  };
  const body = html`<section class="wrap section">
    <h1 class="page-title">${q ? `“${q}”` : c.t('catalog')}</h1>
    <div class="filters">
      <div class="chips" aria-label="${c.t('brands')}">${chip('brand', '', c.t('filter_all'), !brand)}${brands.map((b) => chip('brand', b.slug, b.name, brand === b.slug))}</div>
      <div class="chips">${chip('category', '', c.t('filter_all'), !category)}${cats.map((x) => chip('category', x.slug, loc(x, 'name', c.lang), category === x.slug))}</div>
    </div>
    ${!c.ordering ? html`<p class="catalog-note">${c.t('footer_quote')}</p>` : ''}
    <p class="count muted">${items.length === 1 ? c.t('products_1') : c.t('products_n', { n: items.length })}</p>
    ${items.length ? grid(c, items) : html`<p class="empty">Nothing matches these filters. Try another brand or category.</p>`}
  </section>`;
  send(res, 200, page(c, { title: c.t('catalog'), body }));
}

// ---------- Brand ----------
function brandPage(req, res, slug) {
  const c = ctx(req);
  const b = getBrand(slug);
  if (!b || !b.published) return notFound(req, res);
  const items = listProducts({ brand: slug });
  const groups = new Map();
  for (const p of items) {
    const k = p.category_slug || '_';
    if (!groups.has(k)) groups.set(k, { name: loc({ name: p.category_name, name_ka: p.category_name_ka }, 'name', c.lang) || '', sort: p.category_sort ?? 999, items: [] });
    groups.get(k).items.push(p);
  }
  const body = html`<section class="brand-head">
    <div class="wrap brand-head-grid">
      <div>
        ${b.logo ? html`<img class="brand-logo" src="${b.logo}" alt="${b.name}">` : html`<h1 class="display">${b.name}</h1>`}
        <p class="brand-origin">${b.origin}</p>
      </div>
      <div class="prose">${paragraphs(loc(b, 'description', c.lang) || loc(b, 'tagline', c.lang))}
        ${b.website ? html`<p><a class="link" href="${b.website}" rel="noopener">${b.website.replace(/^https?:\/\//, '')}</a></p>` : ''}</div>
    </div>
  </section>
  ${!items.length ? html`<section class="wrap section brand-empty">
    <h2 class="group-title">Product listings are on their way</h2>
    <p class="lede">We're preparing product photos for the ${b.name} range. Until then, see it in real studios in our gallery, or ask us for a quote on any ${b.name} product.</p>
    <p class="brand-empty-actions"><a class="btn" href="/gallery">Open the studio gallery</a>
      <a class="link" href="mailto:${c.s.company_email}?subject=${encodeURIComponent(b.name + ' — ' + c.s.company_name)}">${c.s.company_email}</a></p>
  </section>` : ''}
  ${[...groups.values()].sort((a, b) => a.sort - b.sort).map((g) => html`<section class="wrap section">
    ${groups.size > 1 ? html`<h2 class="group-title">${g.name}</h2>` : ''}
    ${grid(c, g.items)}
  </section>`)}`;
  send(res, 200, page(c, { title: b.name, body, description: b.tagline }));
}

/** Plain text from the admin → paragraphs, "Heading:" lines and "- bullet" lists. */
function paragraphs(text) {
  const out = []; let list = null;
  for (const raw of String(text || '').split('\n')) {
    const l = raw.trim();
    if (!l) { list = null; continue; }
    if (/^[-•●]\s*/.test(l)) {
      if (!list) { list = []; out.push(list); }
      list.push(l.replace(/^[-•●]\s*/, ''));
      continue;
    }
    list = null;
    out.push(/^[^.!?]{2,40}:$/.test(l) ? { h: l.slice(0, -1) } : l);
  }
  return out.map((b) => Array.isArray(b) ? html`<ul>${b.map((li) => html`<li>${li}</li>`)}</ul>`
    : typeof b === 'object' ? html`<h3>${b.h}</h3>` : html`<p>${b}</p>`);
}

// ---------- Product ----------
function productPage(req, res, slug) {
  const c = ctx(req);
  const p = getProduct(slug);
  if (!p) return notFound(req, res);
  const related = listProducts({ brand: p.brand_slug, limit: 5 }).filter((x) => x.id !== p.id).slice(0, 4);
  const specs = String(p.specs || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : ['', l];
  });
  const hasPrice = Number(p.price_eur) > 0 || Number(p.price_gel_fixed) > 0;
  const askText = encodeURIComponent(`${p.brand_name || ''} ${p.name} — ${c.s.company_name}`);
  const wa = c.s.company_whatsapp ? `https://wa.me/${c.s.company_whatsapp.replace(/\D/g, '')}?text=${askText}` : '';
  const body = html`<article class="wrap product">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/catalog">${c.t('catalog')}</a> / ${p.brand_slug ? html`<a href="/brands/${p.brand_slug}">${p.brand_name}</a> / ` : ''}<span>${p.name}</span></nav>
    <div class="product-grid">
      <div class="gallery" data-gallery>
        <div class="gallery-main">${media(p)}</div>
        ${p.images.length > 1 ? html`<div class="thumbs">${p.images.map((src, i) => html`<button type="button" data-src="${src}" aria-label="Image ${i + 1}" aria-current="${i === 0}"><img src="${src}" alt="" loading="lazy"></button>`)}</div>` : ''}
      </div>
      <div class="buy">
        <p class="card-brand"><a href="/brands/${p.brand_slug}">${p.brand_name}</a>${p.category_name ? html` · ${loc({ name: p.category_name, name_ka: p.category_name_ka }, 'name', c.lang)}` : ''}</p>
        <h1 class="product-title">${p.name}</h1>
        ${loc(p, 'summary', c.lang) ? html`<p class="lede">${loc(p, 'summary', c.lang)}</p>` : ''}
        <div class="buy-price">
          ${!c.ordering && hasPrice ? html`<span class="est-label">${c.t('est_price')}</span>` : ''}
          ${priceBlock(c, p, { size: 'lg' })}
          ${hasPrice ? html`<span class="muted small">${c.ordering ? (c.s.vat_payer === '1' ? c.t('incl_vat') : '') : c.t('est_note')}</span>` : ''}
        </div>
        ${p.variantList.length > 1 ? html`<section class="variants" aria-label="${c.t('options')}">
          <h2>${c.t('options')}</h2>
          <table>${p.variantList.map((v) => html`<tr><th scope="row">${v.label}</th><td>${v.price > 0 ? html`${discountPct() ? html`<s class="price-old">${fmtMoney(variantListPrice(c, p, v), c.cur)}</s> ` : ''}${fmtMoney(variantPrice(c, p, v), c.cur)}` : c.t('price_on_request')}</td></tr>`)}</table>
        </section>` : ''}
        <dl class="facts">
          <div><dt>${c.t('status')}</dt><dd><span class="avail avail-${p.availability}">${c.t(p.availability)}</span></dd></div>
          ${p.lead_time ? html`<div><dt>${c.t('lead_time')}</dt><dd>${p.lead_time}</dd></div>` : ''}
          ${p.sku ? html`<div><dt>SKU</dt><dd>${p.sku}</dd></div>` : ''}
        </dl>
        ${c.ordering && hasPrice && p.availability !== 'on_request'
          ? html`<form class="add" data-add data-id="${p.id}">
              ${p.variantList.length > 1 ? html`<label class="sr" for="variant">${c.t('option')}</label><select id="variant" name="variant">${p.variantList.map((v, i) => html`<option value="${i}">${v.label} — ${fmtMoney(variantPrice(c, p, v), c.cur)}</option>`)}</select>` : ''}
              <label class="sr" for="qty">${c.t('qty')}</label>
              <input id="qty" name="qty" type="number" min="1" max="20" value="1" inputmode="numeric">
              <button class="btn" type="submit">${c.t('add_to_cart')}</button>
            </form>
            <p class="ask">${wa ? html`<a class="link" href="${wa}">${c.t('ask_whatsapp')}</a>` : html`<a class="link" href="mailto:${c.s.company_email}?subject=${askText}">${c.t('ask_email')}</a>`}</p>`
          : html`<div class="quote">
              <a class="btn" href="${wa || `mailto:${c.s.company_email}?subject=${askText}`}">${c.t('request_quote')}</a>
              <p class="quote-alt">${wa ? html`<a class="link" href="mailto:${c.s.company_email}?subject=${askText}">${c.t('ask_email')}</a>` : ''}
                ${c.s.company_phone ? html`<a class="link" href="tel:${c.s.company_phone.replace(/\s+/g, '')}">${c.t('call_us')}</a>` : ''}</p>
            </div>`}
      </div>
    </div>
    ${loc(p, 'description', c.lang) || specs.length ? html`<div class="product-detail">
      ${loc(p, 'description', c.lang) ? html`<section class="prose"><h2>${c.t('description')}</h2>${paragraphs(loc(p, 'description', c.lang))}</section>` : ''}
      ${specs.length ? html`<section><h2>${c.t('specs')}</h2><table class="specs">${specs.map(([k, v]) => html`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}</table></section>` : ''}
    </div>` : ''}
    ${related.length ? html`<section class="section"><div class="section-head"><h2>${c.t('related', { brand: p.brand_name })}</h2><a class="link" href="/brands/${p.brand_slug}">${c.t('see_brand', { brand: p.brand_name })}</a></div>${grid(c, related)}</section>` : ''}
  </article>`;
  send(res, 200, page(c, { title: `${p.brand_name || ''} ${p.name}`.trim(), body, description: p.summary }));
}

/** Price of one option in the current (or the other) currency. */
function variantPrice(c, p, v, other = false) {
  const cur = other ? (c.cur === 'GEL' ? 'EUR' : 'GEL') : c.cur;
  return priceIn({ price_eur: v.price }, cur, c.rate.rate);
}
function variantListPrice(c, p, v) {
  return listPriceIn({ price_eur: v.price }, c.cur, c.rate.rate);
}
function lineFor(p, vIndex, currency, rate) {
  const v = p.variantList.length > 1 ? p.variantList[vIndex] : null;
  if (p.variantList.length > 1 && !v) return null;
  const unit = v ? priceIn({ price_eur: v.price }, currency, rate) : priceIn(p, currency, rate);
  return { unit, label: v ? v.label : '' };
}

// ---------- Cart & checkout ----------
function cartPage(req, res, errors = {}, form = {}) {
  const c = ctx(req);
  const f = (k) => form[k] ?? '';
  const err = (k) => errors[k] ? html`<span class="field-err">${errors[k]}</span>` : '';
  const body = html`<section class="wrap section cart-page">
    <h1 class="page-title">${c.t('cart')}</h1>
    ${errors._ ? html`<p class="notice">${errors._}</p>` : ''}
    <div data-cart-root data-lang="${c.lang}" data-cur="${c.cur}"
      data-i18n="${JSON.stringify({ empty: c.t('cart_empty'), remove: c.t('remove'), total: c.t('subtotal'), qty: c.t('qty'), continue: c.t('continue') })}">
      <p class="muted">…</p>
    </div>
    <form class="checkout" method="post" action="/checkout" data-checkout hidden novalidate>
      <h2>${c.t('checkout_title')}</h2>
      <p class="muted">${c.t('checkout_intro')}</p>
      <input type="hidden" name="cart" data-cart-field>
      <fieldset class="seg"><legend>${c.t('buyer_type')}</legend>
        <label><input type="radio" name="type" value="person" ${f('type') !== 'company' ? 'checked' : ''}> ${c.t('person')}</label>
        <label><input type="radio" name="type" value="company" ${f('type') === 'company' ? 'checked' : ''}> ${c.t('company')}</label>
      </fieldset>
      <div class="fields">
        <label class="f" data-company-only><span>${c.t('company_name')}</span><input name="company" value="${f('company')}" autocomplete="organization">${err('company')}</label>
        <label class="f"><span>${c.t('full_name')}</span><input name="name" value="${f('name')}" required autocomplete="name">${err('name')}</label>
        <label class="f"><span>${c.t('id_code')}</span><input name="id_code" value="${f('id_code')}" inputmode="numeric">${err('id_code')}</label>
        <label class="f"><span>${c.t('email')}</span><input name="email" type="email" value="${f('email')}" required autocomplete="email">${err('email')}</label>
        <label class="f"><span>${c.t('phone')}</span><input name="phone" type="tel" value="${f('phone')}" required autocomplete="tel">${err('phone')}</label>
        <label class="f"><span>${c.t('city')}</span><input name="city" value="${f('city') || 'Tbilisi'}" autocomplete="address-level2"></label>
        <label class="f f-wide"><span>${c.t('address')}</span><input name="address" value="${f('address')}" autocomplete="street-address"></label>
        <label class="f f-wide"><span>${c.t('notes')}</span><textarea name="notes" rows="3">${f('notes')}</textarea></label>
      </div>
      <fieldset class="seg"><legend>${c.t('invoice_currency')}</legend>
        <label><input type="radio" name="currency" value="GEL" ${(f('currency') || c.cur) === 'GEL' ? 'checked' : ''}> GEL ₾</label>
        <label><input type="radio" name="currency" value="EUR" ${(f('currency') || c.cur) === 'EUR' ? 'checked' : ''}> EUR €</label>
      </fieldset>
      <p class="muted small">${c.t('rate_note', { rate: c.rate.rate.toFixed(4), source: c.rate.source })}</p>
      <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn" type="submit">${c.t('create_invoice')}</button>
    </form>
  </section>`;
  send(res, Object.keys(errors).length ? 400 : 200, page(c, { title: c.t('cart'), body }));
}

/** Prices for the cart widget — the browser only stores ids and quantities. */
function cartApi(req, res, url) {
  const c = ctx(req);
  // tokens are "id" or "id:option"
  const keys = (url.searchParams.get('ids') || '').split(',').slice(0, 50);
  const out = [];
  for (const key of keys) {
    const [id, v] = key.split(':').map(Number);
    const p = id > 0 && getProduct(id);
    if (!p) continue;
    const line = lineFor(p, v || 0, c.cur, c.rate.rate);
    out.push({
      key, id: p.id, slug: p.slug, name: p.name, option: line ? line.label : '', brand: p.brand_name, image: p.images[0] || null,
      placeholder: p.images[0] ? null : placeholderSvg(p),
      price: line ? line.unit : 0, priceText: line ? fmtMoney(line.unit, c.cur) : '',
      orderable: !!line && line.unit > 0 && p.availability !== 'on_request',
    });
  }
  sendJson(res, 200, { currency: c.cur, items: out, fmt: c.cur });
}

const recent = new Map(); // simple per-IP throttle for invoice creation
function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const prefix = (getSetting('invoice_prefix') || 'INV').replace(/[^A-Za-z0-9-]/g, '');
  const row = db.prepare(`SELECT COUNT(*) AS n FROM orders WHERE number LIKE ?`).get(`${prefix}-${year}-%`);
  let n = row.n + 1, num;
  do { num = `${prefix}-${year}-${String(n++).padStart(4, '0')}`; } while (db.prepare('SELECT 1 FROM orders WHERE number = ?').get(num));
  return num;
}

async function checkout(req, res) {
  const c = ctx(req);
  const form = await readForm(req);
  if (form.website) return redirect(res, '/'); // honeypot
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const now = Date.now(), hits = (recent.get(ip) || []).filter((t) => now - t < 3600e3);
  if (hits.length >= 10) return cartPage(req, res, { _: 'Too many invoices from this connection. Please contact us directly.' }, form);
  const errors = {};
  const type = form.type === 'company' ? 'company' : 'person';
  for (const k of ['name', 'email', 'phone']) if (!String(form[k] || '').trim()) errors[k] = c.t('required');
  if (type === 'company' && !String(form.company || '').trim()) errors.company = c.t('required');
  if (type === 'company' && !String(form.id_code || '').trim()) errors.id_code = c.t('required');
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = c.t('invalid_email');

  let cart = [];
  try { cart = JSON.parse(form.cart || '[]'); } catch {}
  const currency = form.currency === 'EUR' ? 'EUR' : 'GEL';
  const rate = currentRate();
  const items = [];
  for (const line of Array.isArray(cart) ? cart.slice(0, 50) : []) {
    const p = getProduct(Number(line.id));
    const qty = Math.max(1, Math.min(20, Number(line.qty) | 0));
    if (!p || p.availability === 'on_request') continue;
    const l = lineFor(p, Number(line.v) || 0, currency, rate.rate);
    if (!l || !(l.unit > 0)) continue;
    const unit = l.unit;
    items.push({ id: p.id, sku: p.sku, name: `${p.brand_name ? p.brand_name + ' ' : ''}${p.name}${l.label ? ` — ${l.label}` : ''}`, qty, unit, total: Math.round(unit * qty * 100) / 100 });
  }
  if (!items.length) errors._ = c.t('cart_empty');
  if (Object.keys(errors).length) return cartPage(req, res, errors, form);

  const clip = (v, n = 200) => String(v || '').trim().slice(0, n);
  const customer = {
    type, name: clip(form.name), company: type === 'company' ? clip(form.company) : '', id_code: clip(form.id_code, 40),
    email: clip(form.email), phone: clip(form.phone, 40), city: clip(form.city, 80), address: clip(form.address), notes: clip(form.notes, 1000),
  };
  const total = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  const token = crypto.randomBytes(18).toString('base64url');
  const days = Number(getSetting('invoice_valid_days')) || 5;
  const due = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  const number = nextInvoiceNumber();
  db.prepare(`INSERT INTO orders(number, token, currency, rate, rate_source, customer, items, total, lang, due_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(number, token, currency, rate.rate, rate.source, JSON.stringify(customer), JSON.stringify(items), total, c.lang, due);
  hits.push(now); recent.set(ip, hits);
  console.log(`[order] ${number} ${currency} ${total} — ${customer.email}`);
  redirect(res, `/invoice/${token}?new=1`);
}

function invoice(req, res, token, url) {
  const c = ctx(req);
  const o = db.prepare('SELECT * FROM orders WHERE token = ?').get(token);
  if (!o) return notFound(req, res);
  send(res, 200, invoicePage(c, o, { fresh: url.searchParams.get('new') === '1' }), { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'no-store' });
}

// ---------- Studio gallery ----------
function galleryPage(req, res) {
  const c = ctx(req);
  const items = listGallery();
  const body = html`<section class="wrap section gallery-page">
    <div class="gallery-head">
      <h1 class="page-title">Studio gallery</h1>
      <p class="lede">Real rooms built with the gear and furniture we carry. Tap any photo to see it full size.</p>
    </div>
    ${items.length ? html`<div class="masonry" data-lightbox>
      ${items.map((g, i) => html`<figure class="tile">
        <button type="button" data-index="${i}" aria-label="Open photo ${i + 1}"><img src="${g.image}" alt="${g.caption}" loading="lazy" decoding="async"></button>
        <figcaption><span>${g.caption}</span>${g.credit ? html`<span class="credit">${g.credit}</span>` : ''}</figcaption>
      </figure>`)}
    </div>
    <div class="lightbox" data-lightbox-view hidden>
      <button type="button" class="lb-close" data-lb="close" aria-label="Close">×</button>
      <button type="button" class="lb-nav lb-prev" data-lb="prev" aria-label="Previous photo">‹</button>
      <figure><img alt=""><figcaption></figcaption></figure>
      <button type="button" class="lb-nav lb-next" data-lb="next" aria-label="Next photo">›</button>
    </div>` : html`<p class="empty">No photos yet.</p>`}
  </section>`;
  send(res, 200, page(c, { title: 'Studio gallery', body }));
}

export function notFound(req, res) {
  const c = ctx(req);
  send(res, 404, page(c, { title: '404', body: html`<section class="wrap section"><h1 class="page-title">404</h1><p>${c.t('not_found')}</p><p><a class="btn" href="/">${c.t('home')}</a></p></section>` }));
}

export async function storeRoutes(req, res, url) {
  const p = url.pathname;
  if (req.method === 'GET') {
    if (p === '/') return home(req, res), true;
    if (p === '/catalog') return catalog(req, res, url), true;
    if (p === '/gallery') return galleryPage(req, res), true;
    if (p === '/cart') return (ctx(req).ordering ? cartPage(req, res) : redirect(res, '/catalog')), true;
    if (p === '/api/cart') return cartApi(req, res, url), true;
    let m;
    if ((m = p.match(/^\/brands\/([^/]+)\/?$/))) return brandPage(req, res, decodeURIComponent(m[1])), true;
    if ((m = p.match(/^\/p\/([^/]+)\/?$/))) return productPage(req, res, decodeURIComponent(m[1])), true;
    if ((m = p.match(/^\/invoice\/([A-Za-z0-9_-]{10,})$/))) return invoice(req, res, m[1], url), true;
    if (p === '/set') {
      const back = url.searchParams.get('back') || '/';
      const safe = back.startsWith('/') && !back.startsWith('//') ? back : '/';
      const cookies = [];
      const cur = url.searchParams.get('cur');
      if (cur === 'GEL' || cur === 'EUR') cookies.push(`cur=${cur}; Path=/; Max-Age=31536000; SameSite=Lax`);
      return redirect(res, safe, { 'Set-Cookie': cookies }), true;
    }
  }
  if (req.method === 'POST' && p === '/checkout') return (ctx(req).ordering ? await checkout(req, res) : redirect(res, '/catalog')), true;
  return false;
}
export { AVAIL, esc };
