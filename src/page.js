// Pieces both designs share: the <head> tags, which sections have something to show, the navigation
// and the artist list's shuffle and A–Z switch.
import { html, raw } from './http.js';
import { jsonLd } from './text.js';

export const SITE_URL = 'https://luminescentmastering.com/';
export const PDF_PATH = '/luminescent-mastering-mix-guide.pdf';

export const asset = (opts, name) => `/static/${name}?v=${opts.v || '1'}`;

/** Which sections have content. An empty section is left out, with its knob or link. */
export function visible(c) {
  return {
    services: c.services.items.length > 0,
    equipment: c.equipment.rows.length > 0,
    rates: c.rates.rows.length > 0 || Boolean(c.rates.terms),
    clients: c.artists.names.length > 0,
    send: c.send.blocks.length > 0 || Boolean(c.send.guideButton),
    contact: Boolean(c.contact.email) || c.contact.links.length > 0,
  };
}

export function nav(c) {
  const v = visible(c);
  return [
    ['services', c.services.nav],
    ['equipment', c.equipment.nav],
    ['rates', c.rates.nav],
    ['clients', c.artists.nav],
    ['contact', c.contact.nav],
  ].filter(([id, label]) => v[id] && label).map(([id, label]) => ({ id, label }));
}

export function head(c, opts, { themeColor }) {
  const sameAs = c.contact.links.map((l) => l.url).filter((u) => /^https?:/.test(u));
  const discogsArtist = 'https://www.discogs.com/artist/7924854-Levan-Andiashvili';
  if (!sameAs.includes(discogsArtist)) sameAs.push(discogsArtist);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: c.seo.title,
    url: SITE_URL,
    ...(c.contact.email ? { email: c.contact.email } : {}),
    ...(c.seo.description ? { description: c.seo.description } : {}),
    founder: { '@type': 'Person', name: 'Levan Andiashvili' },
    sameAs,
  };
  return html`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${c.seo.title}</title>
${c.seo.description ? html`<meta name="description" content="${c.seo.description}">` : ''}
<meta property="og:title" content="${c.seo.title}">
${c.seo.description ? html`<meta property="og:description" content="${c.seo.description}">` : ''}
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE_URL}">
<meta name="theme-color" content="${themeColor}">
<link rel="canonical" href="${SITE_URL}">
<link rel="icon" type="image/png" sizes="64x64" href="${asset(opts, 'icon-64.png')}">
<link rel="apple-touch-icon" href="${asset(opts, 'icon-180.png')}">
${opts.preview ? raw('<meta name="robots" content="noindex">') : ''}
<script type="application/ld+json">
${jsonLd(ld)}
</script>`;
}

/** A strip across the top of a preview, so it can't be mistaken for the live site. */
export function previewBar(opts) {
  if (!opts.preview) return '';
  return html`<div style="position:sticky;top:0;z-index:50;display:flex;justify-content:center;gap:14px;flex-wrap:wrap;padding:9px 16px;background:#a06c41;color:#fff;font:500 13px/1.4 system-ui,sans-serif;letter-spacing:.02em">
  <span>Preview: ${opts.preview}</span>
</div>`;
}

/**
 * The artist list's behaviour: a new shuffle on every visit and an A–Z switch.
 * With glow on, names near the mouse pointer light up (the rack design).
 */
export function artistsScript({ glow }) {
  return raw(`<script>
(function () {
  var list = document.getElementById("artists");
  if (!list) return;
  var items = Array.prototype.slice.call(list.children);
  for (var i = items.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = items[i]; items[i] = items[j]; items[j] = t; }
  items.forEach(function (li) { list.appendChild(li); });
  var shuffled = items.slice();
  var collator = new Intl.Collator("en", { sensitivity: "base", ignorePunctuation: true, numeric: true });
  var key = function (li) { return li.textContent.trim().replace(/^the\\s+/i, ""); };
  var sorted = items.slice().sort(function (a, b) { return collator.compare(key(a), key(b)); });
  var sortBtn = document.getElementById("sort");
  var after = function () {};
  if (sortBtn) {
    sortBtn.hidden = false;
    sortBtn.addEventListener("click", function () {
      var on = sortBtn.getAttribute("aria-pressed") !== "true";
      sortBtn.setAttribute("aria-pressed", on ? "true" : "false");
      (on ? sorted : shuffled).forEach(function (li) { list.appendChild(li); });
      after();
    });
  }
  ${glow ? `
  var R = 120, centers = [], box = null, lit = [], cx = -1e4, cy = -1e4;
  function measure() {
    var sx = window.scrollX, sy = window.scrollY, b = list.getBoundingClientRect();
    box = { l: b.left + sx - R, r: b.right + sx + R, t: b.top + sy - R, b: b.bottom + sy + R };
    centers = items.map(function (li) { var r = li.getBoundingClientRect(); return [r.left + sx + r.width / 2, r.top + sy + r.height / 2, r.width / 2]; });
  }
  function clear() { lit.forEach(function (i) { items[i].style.removeProperty("--lit"); }); lit = []; }
  function paint() {
    var px = cx + window.scrollX, py = cy + window.scrollY;
    if (!box || px < box.l || px > box.r || py < box.t || py > box.b) { clear(); return; }
    var next = [];
    for (var i = 0; i < items.length; i++) {
      var c = centers[i], dx = Math.max(Math.abs(px - c[0]) - c[2], 0), dy = py - c[1], d = Math.sqrt(dx * dx + dy * dy);
      if (d < R) { var k = 1 - d / R; items[i].style.setProperty("--lit", (k * k).toFixed(3)); next.push(i); }
    }
    lit.forEach(function (i) { if (next.indexOf(i) < 0) items[i].style.removeProperty("--lit"); });
    lit = next;
  }
  after = function () { clear(); measure(); paint(); };
  measure();
  window.addEventListener("load", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  window.addEventListener("resize", function () { measure(); paint(); });
  window.addEventListener("scroll", paint, { passive: true });
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    cx = e.clientX; cy = e.clientY; paint();
  }, { passive: true });
  document.documentElement.addEventListener("mouseleave", function () { cx = cy = -1e4; clear(); });` : ''}
})();
</script>`);
}
