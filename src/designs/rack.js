// The rack design: a dark front panel with knobs as the navigation, then the sections as rack modules.
import fs from 'node:fs';
import { html, raw, esc } from '../http.js';
import { inline, paras, lines, shuffled } from '../text.js';
import { asset, visible, nav, cta, head, previewBar, artistsScript, PDF_PATH } from '../page.js';

const CSS = fs.readFileSync(new URL('./rack.css', import.meta.url), 'utf8');

export function render(c, opts = {}) {
  const v = visible(c);
  const knobs = nav(c);
  const button = cta(c);
  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(c, opts, { themeColor: '#141517' })}
<style>
${CSS}</style>
</head>
<body>
${previewBar(opts)}
<a class="skip" href="#main">Skip to content</a>

<header class="wrap">
  <section class="unit module" aria-label="${esc(c.seo.title)}">
    <span class="slot a" aria-hidden="true"></span><span class="slot b" aria-hidden="true"></span><span class="slot c" aria-hidden="true"></span><span class="slot d" aria-hidden="true"></span>
    <div class="unit-top">
      <h1 class="logo"><img src="${asset(opts, 'logo-dark.webp')}" alt="${esc(c.seo.title)}" width="960" height="683"></h1>
      <div class="unit-side">
        ${c.intro ? html`<div class="intro">
          ${paras(c.intro)}
        </div>` : ''}
      </div>
    </div>
    ${knobs.length || button ? html`<div class="unit-bottom">
      ${knobs.length ? html`<nav aria-label="Sections">
        <ul class="knobs">
          ${knobs.map((k) => html`<li><a class="k" href="#${k.id}"><span class="dial"><span class="knob"></span></span>${k.label}</a></li>
          `)}
        </ul>
      </nav>` : raw('<span></span>')}
      ${button ? html`<a class="btn" href="${button.href}"><span class="led" aria-hidden="true"></span>${button.label}</a>` : ''}
    </div>` : ''}
  </section>
</header>

<main class="wrap" id="main">
${v.services ? html`  <section class="sec" id="services" aria-labelledby="services-title">
    <div class="head"><h2 id="services-title">${c.services.title || c.services.nav}</h2></div>
    <div class="svc-grid">
      ${c.services.items.map((s) => html`<div class="svc module">
        <h3><span class="led" aria-hidden="true"></span>${s.title}</h3>
        ${paras(s.text)}
      </div>
      `)}
    </div>
  </section>
` : ''}
${v.equipment ? html`  <section class="sec" id="equipment" aria-labelledby="equipment-title">
    <div class="head"><h2 id="equipment-title">${c.equipment.title || c.equipment.nav}</h2></div>
    <div class="gear module screws">
      ${c.equipment.rows.map((r) => html`<div class="gear-row"><span class="legend">${r.label}</span><p>${raw(lines(r.items).map((l) => inline(l)).join('<br>'))}</p></div>
      `)}
    </div>
  </section>
` : ''}
${v.rates ? html`  <section class="sec" id="rates" aria-labelledby="rates-title">
    <div class="head"><h2 id="rates-title">${c.rates.title || c.rates.nav}</h2></div>
    <div class="rates">
      ${c.rates.rows.length ? html`<div class="panel module screws">
        ${c.rates.rows.map((r) => html`<div class="row"><span>${r.name}${r.note ? html` <small>${r.note}</small>` : ''}</span><span class="eur">${r.price}${r.unit ? html` <small>${r.unit}</small>` : ''}</span></div>
        `)}
      </div>` : ''}
      ${c.rates.terms ? html`<div class="terms">
      ${paras(c.rates.terms)}
      </div>` : ''}
    </div>
  </section>
` : ''}
${v.clients ? html`  <section class="sec" id="clients" aria-labelledby="clients-title">
    <div class="head"><h2 id="clients-title">${c.artists.title || c.artists.nav}</h2><button class="sort" type="button" id="sort" aria-pressed="false" hidden><span class="led" aria-hidden="true"></span>A–Z</button></div>
      <ul class="cloud" id="artists">
${raw(shuffled(c.artists.names).map((n) => html`        <li>${n}</li>`).join('\n'))}
      </ul>
      ${c.artists.more ? html`<p class="more">${c.artists.more}</p>` : ''}
      ${artistsScript({ glow: true })}
  </section>
` : ''}
${v.send ? html`  <section class="sec" id="send" aria-labelledby="send-title">
    <div class="head"><h2 id="send-title">${c.send.title || c.send.nav || 'Send your music'}</h2></div>
    ${c.send.blocks.length ? html`<div class="send">
      ${c.send.blocks.map((b, i) => html`<div class="module">
        ${b.title ? html`<h3>${b.title}</h3>` : ''}
        ${paras(b.text, i === 0 ? 'lead' : '')}
      </div>
      `)}
    </div>` : ''}
    ${c.send.guideButton ? html`<div class="guide">
      <a class="btn" href="${PDF_PATH}"><span class="led" aria-hidden="true"></span>${c.send.guideButton}</a>
      ${c.send.guideText ? html`<p>${inline(c.send.guideText)}</p>` : ''}
    </div>` : ''}
  </section>
` : ''}
${v.contact ? html`  <section class="sec" id="contact" aria-labelledby="contact-title">
    <div class="head"><h2 id="contact-title">${c.contact.title || c.contact.nav}</h2></div>
    <div class="contact module screws">
      ${c.contact.email ? html`<div>${c.contact.emailLabel ? html`<span class="legend">${c.contact.emailLabel}</span>` : ''}<p class="value"><a href="mailto:${c.contact.email}">${c.contact.email}</a></p></div>` : ''}
      ${c.contact.links.length ? html`<div>${c.contact.linksLabel ? html`<span class="legend">${c.contact.linksLabel}</span>` : ''}
        <ul class="links">
          ${c.contact.links.map((l) => html`<li><a href="${l.url}">${l.label}</a></li>
          `)}
        </ul>
      </div>` : ''}
    </div>
  </section>
` : ''}
</main>

<footer>
  <div class="wrap legend"><span>${c.footer}</span></div>
</footer>

</body>
</html>
`;
}
