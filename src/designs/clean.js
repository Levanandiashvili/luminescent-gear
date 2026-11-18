// The clean design: Luminescent Gear's layout and type, dark, around the splash logo.
import fs from 'node:fs';
import { html, raw, esc } from '../http.js';
import { inline, paras, paragraphs, lines, shuffled } from '../text.js';
import { asset, visible, nav, cta, head, previewBar, artistsScript, PDF_PATH } from '../page.js';

const CSS = fs.readFileSync(new URL('./clean.css', import.meta.url), 'utf8');

const fonts = (opts) => `@font-face { font-family: "Instrument Serif"; src: url("${asset(opts, 'fonts/serif-400.woff')}") format("woff"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Sans"; src: url("${asset(opts, 'fonts/plex-400.woff')}") format("woff"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "IBM Plex Sans"; src: url("${asset(opts, 'fonts/plex-500.woff')}") format("woff"); font-weight: 500 700; font-style: normal; font-display: swap; }
`;

export function render(c, opts = {}) {
  const v = visible(c);
  const links = nav(c);
  const button = cta(c);
  const intro = paragraphs(c.intro);
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(c, opts, { themeColor: '#0f1311' })}
<link rel="preload" href="${asset(opts, 'fonts/serif-400.woff')}" as="font" type="font/woff" crossorigin>
<style>
${fonts(opts)}${CSS}</style>
</head>
<body>
${previewBar(opts)}
<a class="skip" href="#main">Skip to content</a>

<header class="site-head">
  <div class="wrap head-row">
    <a class="wordmark" href="#top"><img src="${asset(opts, 'icon-64.png')}" alt="" width="30" height="30">${esc(c.seo.title)}</a>
    ${links.length ? html`<nav class="main-nav" aria-label="Sections">
      ${links.map((l) => html`<a href="#${l.id}">${l.label}</a>`)}
    </nav>` : raw('<span style="flex:1"></span>')}
    ${button ? html`<a class="btn btn-small" href="${button.href}">${button.label}</a>` : ''}
  </div>
</header>

<main id="main">
  <section class="hero wrap" id="top">
    <div class="hero-grid">
      <div>
        ${intro.length ? html`<p class="display">${inline(intro[0])}</p>` : ''}
        ${intro.slice(1).map((p) => html`<p class="lede">${inline(p)}</p>`)}
        ${button || v.rates ? html`<div class="hero-actions">
          ${button ? html`<a class="btn" href="${button.href}">${button.label}</a>` : ''}
          ${v.rates && c.rates.nav ? html`<a class="link" href="#rates">${c.rates.nav}</a>` : ''}
        </div>` : ''}
      </div>
      <h1 class="hero-logo"><img src="${asset(opts, 'logo-splash.webp')}" alt="${esc(c.seo.title)}" width="1400" height="997" fetchpriority="high"></h1>
    </div>
  </section>

  <div class="wrap">
${v.services ? html`  <section class="section" id="services" aria-labelledby="services-title">
    <div class="section-head"><h2 id="services-title">${c.services.title || c.services.nav}</h2></div>
    <div class="cards">
      ${c.services.items.map((s) => html`<article class="card">
        ${s.title ? html`<h3>${s.title}</h3>` : ''}
        ${paras(s.text)}
      </article>
      `)}
    </div>
  </section>
` : ''}
${v.equipment ? html`  <section class="section" id="equipment" aria-labelledby="equipment-title">
    <div class="split">
      <h2 id="equipment-title">${c.equipment.title || c.equipment.nav}</h2>
      <dl class="specs">
        ${c.equipment.rows.map((r) => html`<div><dt>${r.label}</dt><dd>${raw(lines(r.items).map((l) => inline(l)).join('<br>'))}</dd></div>
        `)}
      </dl>
    </div>
  </section>
` : ''}
${v.rates ? html`  <section class="section" id="rates" aria-labelledby="rates-title">
    <div class="section-head"><h2 id="rates-title">${c.rates.title || c.rates.nav}</h2></div>
    <div class="price-grid">
      ${c.rates.rows.length ? html`<div class="price-list">
        ${c.rates.rows.map((r) => html`<div class="price-row"><span class="price-name">${r.name}${r.note ? html`<small>${r.note}</small>` : ''}</span><span class="price">${r.price}${r.unit ? html`<small>${r.unit}</small>` : ''}</span></div>
        `)}
      </div>` : ''}
      ${c.rates.terms ? html`<div class="terms">
        ${paras(c.rates.terms)}
      </div>` : ''}
    </div>
  </section>
` : ''}
${v.clients ? html`  <section class="section" id="clients" aria-labelledby="clients-title">
    <div class="section-head"><h2 id="clients-title">${c.artists.title || c.artists.nav}</h2><button class="toggle" type="button" id="sort" aria-pressed="false" hidden>A–Z</button></div>
    <ul class="names" id="artists">
${raw(shuffled(c.artists.names).map((n) => html`      <li>${n}</li>`).join('\n'))}
    </ul>
    ${c.artists.more ? html`<p class="more">${c.artists.more}</p>` : ''}
    ${artistsScript({ glow: false })}
  </section>
` : ''}
${v.send ? html`  <section class="section" id="send" aria-labelledby="send-title">
    <div class="split">
      <div>
        <h2 id="send-title">${c.send.title || c.send.nav || 'Send your music'}</h2>
        ${c.send.guideButton ? html`<div class="guide">
          <a class="btn" href="${PDF_PATH}">${c.send.guideButton}</a>
          ${c.send.guideText ? html`<p>${inline(c.send.guideText)}</p>` : ''}
        </div>` : ''}
      </div>
      ${c.send.blocks.length ? html`<ol class="steps">
        ${c.send.blocks.map((b, i) => html`<li>
          ${b.title ? html`<h3>${b.title}</h3>` : ''}
          ${paras(b.text, i === 0 ? 'lead' : '')}
        </li>
        `)}
      </ol>` : ''}
    </div>
  </section>
` : ''}
  </div>

${v.contact ? html`  <section class="contact-band" id="contact" aria-labelledby="contact-title">
    <div class="wrap contact-in">
      <h2 id="contact-title">${c.contact.title || c.contact.nav}</h2>
      <div>
        ${c.contact.email ? html`<div class="contact-block">
          ${c.contact.emailLabel ? html`<p class="contact-label">${c.contact.emailLabel}</p>` : ''}
          <a class="contact-email" href="mailto:${c.contact.email}">${c.contact.email}</a>
        </div>` : ''}
        ${c.contact.links.length ? html`<div class="contact-block">
          ${c.contact.linksLabel ? html`<p class="contact-label">${c.contact.linksLabel}</p>` : ''}
          <ul class="contact-links">
            ${c.contact.links.map((l) => html`<li><a href="${l.url}">${l.label}</a></li>`)}
          </ul>
        </div>` : ''}
      </div>
    </div>
  </section>
` : ''}
</main>

<footer class="site-foot">
  <div class="wrap"><span class="foot-name">${esc(c.footer)}</span></div>
</footer>

</body>
</html>
`;
}
