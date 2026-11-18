// The clean design: black and monochrome, with the splash logo lit up as the opening of the page.
import fs from 'node:fs';
import { html, raw, esc } from '../http.js';
import { inline, paras, paragraphs, lines, shuffled } from '../text.js';
import { asset, visible, nav, cta, head, previewBar, artistsScript, PDF_PATH } from '../page.js';

const CSS = fs.readFileSync(new URL('./clean.css', import.meta.url), 'utf8');

const fonts = (opts) => [
  ['Inter Display', 200, 'inter-display-200.woff'],
  ['Inter Display', 300, 'inter-display-300.woff'],
  ['Inter', 400, 'inter-400.woff'],
  ['Inter', 500, 'inter-500.woff'],
].map(([family, weight, file]) => `@font-face { font-family: "${family}"; src: url("${asset(opts, `fonts/${file}`)}") format("woff"); font-weight: ${weight}; font-style: normal; font-display: swap; }`).join('\n');

export function render(c, opts = {}) {
  const v = visible(c);
  const button = cta(c);
  const links = nav(c).filter((l) => !button || `#${l.id}` !== button.href);
  const intro = paragraphs(c.intro);

  // Sections get a running number ("01 / 05") in the order they appear.
  const order = ['services', 'equipment', 'rates', 'clients', 'send'].filter((k) => v[k]);
  const num = (k) => `${String(order.indexOf(k) + 1).padStart(2, '0')} / ${String(order.length).padStart(2, '0')}`;
  const secHead = (k, id, title, extra = '') => html`<div class="sec-head">
      <p class="label"><b>${num(k).slice(0, 2)}</b><span>${num(k).slice(3)}</span></p>
      <h2 id="${id}">${title}</h2>
      ${extra}
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(c, opts, { themeColor: '#070707' })}
<link rel="preload" href="${asset(opts, 'fonts/inter-display-300.woff')}" as="font" type="font/woff" crossorigin>
<link rel="preload" href="${asset(opts, 'logo-splash.webp')}" as="image">
<style>
${fonts(opts)}
${CSS}.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style>
</head>
<body>
${previewBar(opts)}
<a class="skip" href="#main">Skip to content</a>

<header class="site-head">
  <div class="wrap head-row">
    <a class="mark" href="#top"><img src="${asset(opts, 'star-mark.png')}" alt="" width="30" height="30"><span>${esc(c.seo.title)}</span></a>
    ${links.length ? html`<nav class="main-nav" aria-label="Sections">
      ${links.map((l) => html`<a href="#${l.id}">${l.label}</a>`)}
    </nav>` : raw('<span style="flex:1"></span>')}
    ${button ? html`<a class="btn btn-small" href="${button.href}">${button.label}</a>` : ''}
  </div>
</header>

<main id="main">
  <section class="hero wrap" id="top">
    <h1 class="hero-logo"><img src="${asset(opts, 'logo-splash.webp')}" alt="${esc(c.seo.title)}" width="1400" height="997" fetchpriority="high"></h1>
    ${intro.map((p) => html`<p class="intro">${inline(p)}</p>`)}
    ${button || (v.rates && c.rates.nav) ? html`<div class="hero-actions">
      ${button ? html`<a class="btn" href="${button.href}">${button.label}</a>` : ''}
      ${v.rates && c.rates.nav && button?.href !== '#rates' ? html`<a class="btn btn-line" href="#rates">${c.rates.nav}</a>` : ''}
    </div>` : ''}
  </section>

  <div class="wrap">
${v.services ? html`  <section class="sec" id="services" aria-labelledby="services-title">
    ${secHead('services', 'services-title', c.services.title || c.services.nav)}
    <div class="svc">
      ${c.services.items.map((s, i) => html`<article>
        <span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
        ${s.title ? html`<h3>${s.title}</h3>` : ''}
        <div>${paras(s.text)}</div>
      </article>
      `)}
    </div>
  </section>
` : ''}
${v.equipment ? html`  <section class="sec" id="equipment" aria-labelledby="equipment-title">
    ${secHead('equipment', 'equipment-title', c.equipment.title || c.equipment.nav)}
    <dl class="specs">
      ${c.equipment.rows.map((r) => html`<div><dt class="label">${r.label}</dt><dd>${raw(lines(r.items).map((l) => inline(l)).join('<br>'))}</dd></div>
      `)}
    </dl>
  </section>
` : ''}
${v.rates ? html`  <section class="sec" id="rates" aria-labelledby="rates-title">
    ${secHead('rates', 'rates-title', c.rates.title || c.rates.nav)}
    ${c.rates.rows.length ? html`<ul class="prices">
      ${c.rates.rows.map((r) => html`<li><span class="p-name">${r.name}${r.note ? html`<small>${r.note}</small>` : ''}</span><span class="p-price">${r.price}${r.unit ? html`<small>${r.unit}</small>` : ''}</span></li>
      `)}
    </ul>` : ''}
    ${c.rates.terms ? html`<div class="terms">
      ${paras(c.rates.terms)}
    </div>` : ''}
  </section>
` : ''}
${v.clients ? html`  <section class="sec" id="clients" aria-labelledby="clients-title">
    ${secHead('clients', 'clients-title', c.artists.title || c.artists.nav, html`<button class="az" type="button" id="sort" aria-pressed="false" hidden>A–Z</button>`)}
    <ul class="names" id="artists">
${raw(shuffled(c.artists.names).map((n) => html`      <li>${n}</li>`).join('\n'))}
    </ul>
    ${c.artists.more ? html`<p class="more">${c.artists.more}</p>` : ''}
    ${artistsScript({ glow: true })}
  </section>
` : ''}
${v.send ? html`  <section class="sec" id="send" aria-labelledby="send-title">
    ${secHead('send', 'send-title', c.send.title || c.send.nav || 'Send your music')}
    ${c.send.blocks.length ? html`<ol class="steps">
      ${c.send.blocks.map((b, i) => html`<li>
        ${b.title ? html`<h3>${b.title}</h3>` : ''}
        ${paras(b.text, i === 0 ? 'lead' : '')}
      </li>
      `)}
    </ol>` : ''}
    ${c.send.guideButton ? html`<div class="guide">
      <a class="btn btn-line" href="${PDF_PATH}">${c.send.guideButton}</a>
      ${c.send.guideText ? html`<p>${inline(c.send.guideText)}</p>` : ''}
    </div>` : ''}
  </section>
` : ''}
  </div>

${v.contact ? html`  <section class="contact" id="contact" aria-labelledby="contact-title">
    <div class="wrap">
      <p class="label" id="contact-title">${c.contact.title || c.contact.nav}</p>
      ${c.contact.email ? html`<div class="contact-group">
        <h2>${c.contact.emailLabel ? html`<span class="sr">${c.contact.emailLabel}: </span>` : ''}<a href="mailto:${c.contact.email}">${c.contact.email}</a></h2>
      </div>` : ''}
      ${c.contact.links.length ? html`<div class="contact-group">
        ${c.contact.linksLabel ? html`<p class="label">${c.contact.linksLabel}</p>` : ''}
        <ul class="contact-links">
          ${c.contact.links.map((l) => html`<li><a href="${l.url}">${l.label}</a></li>`)}
        </ul>
      </div>` : ''}
    </div>
  </section>
` : ''}
</main>

<footer class="site-foot">
  <div class="wrap label"><span>${esc(c.footer)}</span><a href="#top" aria-label="Back to the top">↑</a></div>
</footer>

</body>
</html>
`;
}
