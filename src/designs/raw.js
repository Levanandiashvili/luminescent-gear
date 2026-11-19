// The raw design: black, typewriter text, the splash logo. Plain, small and handmade, laid out compactly like a flyer.
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
<header class="top">
  <h1><a class="logo" href="#top"><img src="${asset(opts, 'logo-dark.webp')}" alt="${esc(c.seo.title)}" width="960" height="683"></a></h1>
  <div class="top-text">
    ${intro.map((p) => html`<p class="intro">${inline(p)}</p>`)}
    ${links.length || button ? html`<div class="top-nav">
      ${links.length ? html`<nav aria-label="Sections">
        ${links.map((l) => html`<a href="#${l.id}">${l.label}</a>`)}
      </nav>` : ''}
      ${button ? html`<a class="stamp" href="${button.href}">${button.label}</a>` : ''}
    </div>` : ''}
  </div>
</header>

<main class="grid" id="main">
${v.services ? html`  <section class="sec" id="services" aria-labelledby="services-title">
    <h2 id="services-title">${c.services.title || c.services.nav}</h2>
    <dl class="svc">
      ${c.services.items.map((s) => html`<div><dt>${s.title}</dt><dd>${paras(s.text)}</dd></div>
      `)}
    </dl>
  </section>
` : ''}
${v.equipment ? html`  <section class="sec" id="equipment" aria-labelledby="equipment-title">
    <h2 id="equipment-title">${c.equipment.title || c.equipment.nav}</h2>
    <dl class="kv">
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
${v.send ? html`  <section class="sec wide" id="send" aria-labelledby="send-title">
    <h2 id="send-title">${c.send.title || c.send.nav || 'Send your music'}</h2>
    ${c.send.blocks.length ? html`<dl class="rider">
      ${c.send.blocks.map((b) => html`<div><dt>${b.title}</dt><dd>${paras(b.text)}</dd></div>
      `)}
    </dl>` : ''}
    ${c.send.guideButton ? html`<p class="guide"><a href="${PDF_PATH}">${c.send.guideButton}</a>${c.send.guideText ? html` ${inline(c.send.guideText)}` : ''}</p>` : ''}
  </section>
` : ''}
${v.clients ? html`  <section class="sec wide" id="clients" aria-labelledby="clients-title">
    <h2><span id="clients-title">${c.artists.title || c.artists.nav}</span><button class="toggle" type="button" id="sort" aria-pressed="false" hidden>[a–z]</button></h2>
    <ul class="lineup" id="artists">
${raw(shuffled(c.artists.names).map((n) => html`<li>${n}</li>`).join('\n'))}
    </ul>
    <p class="more">${c.artists.more ? html`<span>${c.artists.more}</span>` : ''}<button class="toggle" type="button" id="unfold" aria-expanded="false" aria-controls="artists" hidden>[+ all ${c.artists.names.length}]</button></p>
    ${artistsScript({ glow: true, radius: 100, touch: true })}
    <script>
(function () {
  var list = document.getElementById("artists"), btn = document.getElementById("unfold");
  if (!list || !btn) return;
  list.classList.add("folded");
  if (list.scrollHeight <= list.clientHeight + 4) { list.classList.remove("folded"); return; }
  var label = btn.textContent;
  btn.hidden = false;
  btn.addEventListener("click", function () {
    var open = list.classList.toggle("folded") === false;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "[− fewer]" : label;
    window.dispatchEvent(new Event("resize"));
  });
})();
    </script>
  </section>
` : ''}
${v.contact ? html`  <section class="sec" id="contact" aria-labelledby="contact-title">
    <h2 id="contact-title">${c.contact.title || c.contact.nav}</h2>
    <dl class="contact-line">
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
