import { html, raw } from './http.js';
import { allSettings, listBrands } from './db.js';
import { currentRate, priceIn } from './rates.js';
import { translator } from './i18n.js';

export function fmtMoney(n, cur) {
  const v = Number(n || 0);
  const digits = cur === 'EUR' && Math.round(v) !== v ? 2 : 0;
  const s = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return cur === 'EUR' ? `€${s}` : `${s} ₾`;
}

/** Context shared by every storefront page. */
export function ctx(req) {
  const cookies = req.cookies;
  const lang = 'en';
  const s = allSettings();
  const cur = cookies.cur === 'EUR' || cookies.cur === 'GEL' ? cookies.cur : (s.default_currency === 'EUR' ? 'EUR' : 'GEL');
  const rate = currentRate();
  const ordering = s.ordering_enabled === '1';
  return { lang, cur, s, rate, ordering, t: translator(lang), path: req.url };
}

export function priceBlock(c, p, { size = 'sm' } = {}) {
  if (!(Number(p.price_eur) > 0) && !(Number(p.price_gel_fixed) > 0)) {
    return html`<span class="price price-${size}"><span class="price-main">${c.t('price_on_request')}</span></span>`;
  }
  const other = c.cur === 'GEL' ? 'EUR' : 'GEL';
  const main = priceIn(p, c.cur, c.rate.rate), alt = priceIn(p, other, c.rate.rate);
  return html`<span class="price price-${size}">
    ${p.price_from ? html`<span class="price-from">${c.t('from')} </span>` : ''}<span class="price-main">${fmtMoney(main, c.cur)}</span>
  </span>`;
}

const swapQuery = (path, key, val) => `/set?${key}=${val}&back=${encodeURIComponent(path)}`;

export function page(c, { title, body, description = '', bodyClass = '' }) {
  const { s, t, lang } = c;
  const fullTitle = title ? `${title} — ${s.company_name}` : s.company_name;
  return html`<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${description || s.hero_text}">
${s.site_url ? html`<link rel="canonical" href="${s.site_url.replace(/\/$/, '') + (c.path || '/').split('?')[0]}">
<meta property="og:site_name" content="${s.company_name}"><meta property="og:title" content="${fullTitle}"><meta property="og:url" content="${s.site_url.replace(/\/$/, '') + (c.path || '/').split('?')[0]}">` : ''}
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/static/site.css?v=10">
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<header class="site-head">
  <div class="wrap head-row">
    <a class="wordmark" href="/"><span>${s.company_name}</span></a>
    <nav class="main-nav" aria-label="Main">
      <a href="/catalog">${t('catalog')}</a>
      ${listBrands().slice(0, 4).map((b) => html`<a href="/brands/${b.slug}">${b.name}</a>`)}
      <a href="/gallery">Gallery</a>
      <a href="/#contact">${t('contact')}</a>
    </nav>
    <div class="head-tools">
      <form class="head-search" action="/catalog" role="search"><label class="sr" for="q">${t('search')}</label><input id="q" name="q" type="search" placeholder="${t('search_ph')}"></form>
      <div class="toggle" aria-label="Currency">
        <a href="${swapQuery(c.path, 'cur', 'GEL')}" aria-current="${c.cur === 'GEL'}">₾</a><a href="${swapQuery(c.path, 'cur', 'EUR')}" aria-current="${c.cur === 'EUR'}">€</a>
      </div>
      ${c.ordering ? html`<a class="cart-link" href="/cart">${t('cart')} <span class="cart-count" data-cart-count>0</span></a>` : ''}
    </div>
  </div>
</header>
<main id="main">${body}</main>
<footer class="site-foot" id="contact">
  <div class="wrap foot-grid">
    <div>
      <p class="foot-name">${s.company_name}</p>
      <p>${t('official_dealer')}: ${listBrands().map((b) => b.name).join(', ')}.</p>
      <p>${s.company_address}</p>
    </div>
    <div>
      <p><a href="mailto:${s.company_email}">${s.company_email}</a></p>
      ${s.company_phone ? html`<p><a href="tel:${s.company_phone.replace(/\s+/g, '')}">${s.company_phone}</a></p>` : ''}
      ${s.company_whatsapp ? html`<p><a href="https://wa.me/${s.company_whatsapp.replace(/\D/g, '')}">WhatsApp</a></p>` : ''}
      ${s.company_instagram ? html`<p><a href="${s.company_instagram}">Instagram</a></p>` : ''}
    </div>
    <div>
      <p>${c.ordering ? t('footer_pay') + '.' : t('footer_quote')}</p>
    </div>
  </div>
  <div class="wrap foot-legal"><span>© ${new Date().getFullYear()} ${s.company_legal || s.company_name}</span></div>
</footer>
<div class="toast" role="status" aria-live="polite" data-toast></div>
<script src="/static/site.js?v=6" defer></script>
</body></html>`.toString();
}
export { raw };
