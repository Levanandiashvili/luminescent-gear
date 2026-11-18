// The raw design: black, typewriter text, the splash logo in a side column. Plain, small and handmade.
import fs from 'node:fs';
import { html, raw, esc } from '../http.js';
import { inline, paras, paragraphs, lines, shuffled } from '../text.js';
import { asset, visible, nav, cta, head, previewBar, artistsScript, PDF_PATH } from '../page.js';

const CSS = fs.readFileSync(new URL('./raw.css', import.meta.url), 'utf8');

const fonts = (opts) => `@font-face { font-family: "LM Mono"; src: url("${asset(opts, 'fonts/lm-mono-10.woff')}") format("woff"); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: "LM Mono"; src: url("${asset(opts, 'fonts/lm-mono-10-italic.woff')}") format("woff"); font-weight: 400; font-style: italic; font-display: swap; }`;

export function render(c, opts = {}) {
  const v = visible(c);
  const button = cta(c);
  const links = nav(c).filter((l) => !button || `#${l.id}` !== button.href);
  const intro = paragraphs(c.intro);

  return `<!DOCTYPE html>
<html lang="en">
<head>
${head(c, opts, { themeColor: '#0b0b0a' })}
<link rel="preload" href="${asset(opts, 'fonts/lm-mono-10.woff')}" as="font" type="font/woff" crossorigin>
<style>
${fonts(opts)}
${CSS}</style>
</head>
<body>
${previewBar(opts)}
<a class="skip" href="#main">Skip to content</a>

<div class="page" id="top">
<header class="side">
  <h1><a class="logo" href="#top"><img src="${asset(opts, 'logo-dark.webp')}" alt="${esc(c.seo.title)}" width="960" height="683"></a></h1>
  ${links.length ? html`<nav aria-label="Sections">
    ${links.map((l) => html`<a href="#${l.id}">${l.label}</a>`)}
  </nav>` : ''}
  ${button ? html`<a class="stamp" href="${button.href}">${button.label}</a>` : ''}
</header>

<main id="main">
  ${intro.map((p) => html`<p class="intro">${inline(p)}</p>`)}

${v.services ? html`  <section class="sec" id="services" aria-labelledby="services-title">
    <h2 id="services-title">${c.services.title || c.services.nav}</h2>
    <dl class="kv">
      ${c.services.items.map((s) => html`<div><dt>${s.title}</dt><dd>${paras(s.text)}</dd></div>
      `)}
    </dl>
  </section>
` : ''}
${v.equipment ? html`  <section class="sec" id="equipment" aria-labelledby="equipment-title">
    <h2 id="equipment-title">${c.equipment.title || c.equipment.nav}</h2>
    <dl class="kv gear">
      ${c.equipment.rows.map((r) => html`<div><dt>${r.label}</dt><dd>${raw(lines(r.items).map((l) => inline(l)).join('<br>'))}</dd></div>
      `)}
    </dl>
  </section>
` : ''}
${v.rates ? html`  <section class="sec" id="rates" aria-labelledby="rates-title">
    <h2 id="rates-title">${c.rates.title || c.rates.nav}</h2>
    ${c.rates.rows.length ? html`<ul class="prices">
      ${c.rates.rows.map((r) => html`<li><span>${r.name}${r.note ? html` <span class="note">(${r.note})</span>` : ''}</span><span class="dots" aria-hidden="true"></span><span class="amt">${r.price}${r.unit ? html` <span class="unit">${r.unit}</span>` : ''}</span></li>
      `)}
    </ul>` : ''}
    ${c.rates.terms ? html`<div class="terms">
      ${paras(c.rates.terms)}
    </div>` : ''}
  </section>
` : ''}
${v.clients ? html`  <section class="sec" id="clients" aria-labelledby="clients-title">
    <h2><span id="clients-title">${c.artists.title || c.artists.nav}</span><button class="toggle" type="button" id="sort" aria-pressed="false" hidden>[a–z]</button></h2>
    <ul class="lineup" id="artists">
${raw(shuffled(c.artists.names).map((n) => html`<li>${n}</li>`).join('\n'))}
    </ul>
    ${c.artists.more ? html`<p class="more">${c.artists.more}</p>` : ''}
    ${artistsScript({ glow: false })}
  </section>
` : ''}
${v.send ? html`  <section class="sec" id="send" aria-labelledby="send-title">
    <h2 id="send-title">${c.send.title || c.send.nav || 'Send your music'}</h2>
    ${c.send.blocks.length ? html`<ol class="steps">
      ${c.send.blocks.map((b, i) => html`<li><div>
        ${b.title ? html`<h3>${b.title}</h3>` : ''}
        ${paras(b.text, i === 0 ? 'lead' : '')}
      </div></li>
      `)}
    </ol>` : ''}
    ${c.send.guideButton ? html`<p class="guide"><a href="${PDF_PATH}">${c.send.guideButton}</a>${c.send.guideText ? html` ${inline(c.send.guideText)}` : ''}</p>` : ''}
  </section>
` : ''}
${v.contact ? html`  <section class="sec" id="contact" aria-labelledby="contact-title">
    <h2 id="contact-title">${c.contact.title || c.contact.nav}</h2>
    <dl class="kv">
      ${c.contact.email ? html`<div><dt>${c.contact.emailLabel || 'Email'}</dt><dd><a href="mailto:${c.contact.email}">${c.contact.email}</a></dd></div>` : ''}
      ${c.contact.links.length ? html`<div><dt>${c.contact.linksLabel || 'Elsewhere'}</dt><dd>${raw(c.contact.links.map((l) => html`<a href="${l.url}">${l.label}</a>`.toString()).join(' / '))}</dd></div>` : ''}
    </dl>
  </section>
` : ''}
</main>

<footer>
  <span>${esc(c.footer)}</span>
  <a href="#top" aria-label="Back to the top">↑</a>
</footer>
</div>

</body>
</html>
`;
}
