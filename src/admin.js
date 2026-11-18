// The admin panel at /admin: sign in, edit every text on the page, pick the design, go back to an earlier version.
import crypto from 'node:crypto';
import { html, raw, esc, send, redirect, readForm, clientIp, sameOrigin, SECURITY_HEADERS } from './http.js';
import { load, save, normalize, history, restore, DESIGNS, SECTIONS } from './content.js';
import {
  configured, checkPassword, makeSession, session, sessionCookie, csrfToken, csrfOk,
  tooManyAttempts, noteFailure, clearFailures,
} from './auth.js';

const ADMIN_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};
const page = (res, status, body, headers = {}) => send(res, status, body, { ...ADMIN_HEADERS, ...headers });

const DESIGN_NOTES = {
  rack: 'The dark front panel with silver knobs.',
  raw: 'Black and plain, typewriter text and your splash logo, like a photocopied flyer.',
};

// ---- Page frame ----

function frame(opts, title, body) {
  const v = opts.v || '1';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} · Luminescent Mastering</title>
<link rel="icon" type="image/png" href="/static/icon-64.png?v=${v}">
<link rel="stylesheet" href="/static/admin.css?v=${v}">
<script src="/static/admin.js?v=${v}" defer></script>
</head>
${body}
</html>
`;
}

function loginPage(res, opts, { error = '', status = 200 } = {}) {
  const body = html`<body class="login">
<main class="login-box">
  <img src="/static/logo-light.webp?v=${opts.v}" alt="Luminescent Mastering" width="480" height="342">
  <h1>Admin</h1>
  ${configured() ? html`
  ${error ? html`<p class="flash err" role="alert">${error}</p>` : ''}
  <form method="post" action="/admin/login" class="form">
    <label class="f"><span>Password</span><input type="password" name="password" autofocus required autocomplete="current-password"></label>
    <button class="btn">Sign in</button>
  </form>` : html`
  <div class="flash warn">
    <p><strong>The admin password isn't set yet.</strong></p>
    <p>In Railway, open the project <b>luminescent-mastering</b>, then the <b>website</b> service, then <b>Variables</b>. Add a variable named <code>ADMIN_PASSWORD</code> with the password you want, and press <b>Deploy</b>. After a minute you can sign in here.</p>
  </div>`}
  <p class="muted small"><a href="/">Back to the site</a></p>
</main>
</body>`;
  page(res, status, frame(opts, 'Sign in', body.toString()));
}

// ---- Editor ----

const field = (label, name, value, { hint = '', rows = 0, type = 'text', wide = false, attrs = '' } = {}) => html`
<label class="f${wide ? ' wide' : ''}"><span>${label}${hint ? html` <em>${hint}</em>` : ''}</span>${rows
    ? html`<textarea name="${name}" rows="${rows}" ${raw(attrs)}>${value}</textarea>`
    : html`<input type="${type}" name="${name}" value="${value}" ${raw(attrs)}>`}</label>`;

/** A list of repeated items (services, rates, links…) that can be added to, moved and removed. */
function rows(group, items, render, addLabel) {
  const item = (row, i) => html`<div class="item">
  <div class="item-fields">${render(row, (f) => `${group}.${i}.${f}`)}</div>
  <div class="item-tools">
    <button type="button" class="tool" data-act="up" title="Move up" aria-label="Move up">↑</button>
    <button type="button" class="tool" data-act="down" title="Move down" aria-label="Move down">↓</button>
    <button type="button" class="tool tool-x" data-act="remove" title="Remove" aria-label="Remove">✕</button>
  </div>
</div>`;
  const blank = Object.fromEntries(Object.keys(items[0] || {}).map((k) => [k, '']));
  return html`<div class="rows" data-group="${group}">
${items.map((r, i) => item(r, i))}
<template>${item(blank, '__i__')}</template>
<button type="button" class="btn btn-ghost btn-small" data-act="add">+ ${addLabel}</button>
</div>`;
}

const sectionHead = (key, c) => html`<div class="f-row">
  ${field('Menu label', `${key}.nav`, c[key].nav, { hint: 'the knob or link at the top' })}
  ${field('Heading', `${key}.title`, c[key].title)}
</div>`;

const berlin = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });

function editorPage(res, opts, sess, { flash = [], content = null } = {}) {
  const c = content || load();
  const csrf = csrfToken(sess);
  const blankBy = (keys) => Object.fromEntries(keys.map((k) => [k, '']));
  const withBlank = (list, keys) => (list.length ? list : [blankBy(keys)]);
  const versions = history();

  const body = html`<body class="adm">
<header class="bar">
  <div class="bar-in">
    <a class="bar-name" href="/admin">Luminescent Mastering <span>Admin</span></a>
    <div class="bar-actions">
      <a class="btn btn-ghost" href="/" target="_blank" rel="noopener">View site ↗</a>
      <button form="editor" class="btn btn-ghost" formaction="/admin/preview" formtarget="_blank">Preview changes ↗</button>
      <button form="editor" class="btn" data-save>Save changes</button>
    </div>
  </div>
</header>

<main class="main">
${flash.map((f) => html`<p class="flash ${f.kind || ''}" role="status">${f.text}</p>`)}

<form id="editor" class="form" method="post" action="/admin/save" data-dirty-guard>
<input type="hidden" name="csrf" value="${csrf}">

<fieldset class="designs">
  <legend>Design</legend>
  <div class="design-grid">
  ${Object.entries(DESIGNS).map(([key, name]) => html`<label class="design-card">
    <input type="radio" name="design" value="${key}" ${c.design === key ? raw('checked') : ''}>
    <img src="/static/design-${key}.png?v=${opts.v}" alt="" width="600" height="375" loading="lazy">
    <span class="design-text"><strong>${name}</strong> ${DESIGN_NOTES[key]}</span>
    <a class="small" href="/admin/preview?design=${key}" target="_blank" rel="noopener">Preview ↗</a>
  </label>`)}
  </div>
  <p class="muted small">Pick one and press Save changes. Visitors see the new design straight away.</p>
</fieldset>

<fieldset>
  <legend>Top of the page</legend>
  ${field('Intro', 'intro', c.intro, { rows: 3, hint: 'by the logo at the top; a blank line starts a new paragraph' })}
  <div class="f-row f-row-3">
    ${field('Button', 'cta', c.cta, { hint: 'empty hides it' })}
    <label class="f"><span>Button goes to</span><select name="ctaTarget">${Object.entries(SECTIONS).map(([k, label]) => html`<option value="${k}" ${c.ctaTarget === k ? raw('selected') : ''}>${label}</option>`)}</select></label>
    ${field('Site name', 'seo.title', c.seo.title, { hint: 'browser tab and Google' })}
  </div>
  ${field('Google description', 'seo.description', c.seo.description, { rows: 2, hint: 'the short text under the link in Google results' })}
</fieldset>

<fieldset>
  <legend>Services</legend>
  ${sectionHead('services', c)}
  ${rows('services.items', withBlank(c.services.items, ['title', 'text']), (r, n) => html`
    ${field('Title', n('title'), r.title)}
    ${field('Text', n('text'), r.text, { rows: 3 })}`, 'Add a service')}
</fieldset>

<fieldset>
  <legend>Equipment</legend>
  ${sectionHead('equipment', c)}
  ${rows('equipment.rows', withBlank(c.equipment.rows, ['label', 'items']), (r, n) => html`
    ${field('Group', n('label'), r.label)}
    ${field('Items', n('items'), r.items, { rows: 3, hint: 'one per line' })}`, 'Add a group')}
</fieldset>

<fieldset>
  <legend>Rates</legend>
  ${sectionHead('rates', c)}
  ${rows('rates.rows', withBlank(c.rates.rows, ['name', 'note', 'price', 'unit']), (r, n) => html`
    <div class="f-row f-row-4">
      ${field('Name', n('name'), r.name)}
      ${field('Note', n('note'), r.note, { hint: 'small, after the name' })}
      ${field('Price', n('price'), r.price)}
      ${field('Unit', n('unit'), r.unit, { hint: 'small, after the price' })}
    </div>`, 'Add a price')}
  ${field('Text next to the prices', 'rates.terms', c.rates.terms, { rows: 4, hint: 'a blank line starts a new paragraph' })}
</fieldset>

<fieldset>
  <legend>Artists</legend>
  ${sectionHead('artists', c)}
  ${field('Names', 'artists.names', c.artists.names.join('\n'), { rows: 14, hint: html`one per line; the page shuffles them, so the order here doesn't matter. <b data-count-for="artists.names">${c.artists.names.length}</b> names`, attrs: 'spellcheck="false" class="mono"' })}
  ${field('Line under the list', 'artists.more', c.artists.more)}
</fieldset>

<fieldset>
  <legend>Send your music</legend>
  <div class="f-row">
    ${field('Menu label', 'send.nav', c.send.nav, { hint: 'leave empty: no knob or link for this section' })}
    ${field('Heading', 'send.title', c.send.title)}
  </div>
  ${rows('send.blocks', withBlank(c.send.blocks, ['title', 'text']), (r, n) => html`
    ${field('Title', n('title'), r.title)}
    ${field('Text', n('text'), r.text, { rows: 5, hint: 'a blank line starts a new paragraph' })}`, 'Add a block')}
  <div class="f-row">
    ${field('Guide button', 'send.guideButton', c.send.guideButton, { hint: 'opens the PDF guide; leave empty to hide it' })}
    ${field('Text next to the guide button', 'send.guideText', c.send.guideText)}
  </div>
</fieldset>

<fieldset>
  <legend>Contact</legend>
  ${sectionHead('contact', c)}
  <div class="f-row">
    ${field('Email label', 'contact.emailLabel', c.contact.emailLabel)}
    ${field('Email', 'contact.email', c.contact.email, { type: 'email' })}
  </div>
  ${field('Links label', 'contact.linksLabel', c.contact.linksLabel)}
  ${rows('contact.links', withBlank(c.contact.links, ['label', 'url']), (r, n) => html`
    <div class="f-row">
      ${field('Name', n('label'), r.label)}
      ${field('Address', n('url'), r.url, { attrs: 'inputmode="url" placeholder="https://"' })}
    </div>`, 'Add a link')}
</fieldset>

<fieldset>
  <legend>Footer</legend>
  ${field('Footer text', 'footer', c.footer)}
</fieldset>

<div class="save-row">
  <button class="btn" data-save>Save changes</button>
  <button class="btn btn-ghost" formaction="/admin/preview" formtarget="_blank">Preview changes ↗</button>
</div>
</form>

<section class="versions">
  <h2>Earlier versions</h2>
  ${versions.length ? html`<p class="muted small">Every save keeps the version before it. Restoring one puts its texts and design back on the site (and keeps today's version here too).</p>
  <ul class="version-list">
    ${versions.map((ver) => html`<li>
      <span>${ver.when ? berlin.format(ver.when) : ver.name}${ver.original ? ' · original texts' : ''}</span>
      <form method="post" action="/admin/restore" data-confirm="Put this version back on the site?">
        <input type="hidden" name="csrf" value="${csrf}">
        <input type="hidden" name="name" value="${ver.name}">
        <button class="btn btn-ghost btn-small">Restore</button>
      </form>
    </li>`)}
  </ul>` : html`<p class="muted small">After your first save, the versions before each save are listed here, so you can go back.</p>`}
  <p class="small"><a href="/admin/export">Download a copy of all texts</a> (a small JSON file, for safekeeping)</p>
</section>

<footer class="adm-foot">
  <form method="post" action="/admin/logout">
    <input type="hidden" name="csrf" value="${csrf}">
    <button class="linkbtn">Sign out</button>
  </form>
</footer>
</main>
</body>`;
  page(res, 200, frame(opts, 'Admin', body.toString()));
}

// ---- Form → content ----

const ALLOWED = new RegExp('^(?:design|intro|cta|ctaTarget|footer|seo\\.(?:title|description)'
  + '|(?:services|equipment|rates|artists|send|contact)\\.nav|(?:services|equipment|rates|artists|send|contact)\\.title'
  + '|rates\\.terms|artists\\.(?:more|names)|send\\.(?:guideButton|guideText)|contact\\.(?:emailLabel|email|linksLabel)'
  + '|services\\.items\\.\\d{1,3}\\.(?:title|text)|equipment\\.rows\\.\\d{1,3}\\.(?:label|items)'
  + '|rates\\.rows\\.\\d{1,3}\\.(?:name|note|price|unit)|send\\.blocks\\.\\d{1,3}\\.(?:title|text)'
  + '|contact\\.links\\.\\d{1,3}\\.(?:label|url))$');

export function formToContent(form) {
  const out = {};
  for (const [key, value] of Object.entries(form)) {
    if (!ALLOWED.test(key)) continue;
    const parts = key.split('.');
    let o = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!Object.hasOwn(o, p)) o[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      o = o[p];
    }
    o[parts.at(-1)] = value;
  }
  for (const [sec, key] of [['services', 'items'], ['equipment', 'rows'], ['rates', 'rows'], ['send', 'blocks'], ['contact', 'links']]) {
    if (out[sec] && Array.isArray(out[sec][key])) out[sec][key] = out[sec][key].filter(Boolean);
  }
  return out;
}

// ---- Routes ----

const flashes = new Map();
function keepFlash(list) {
  const id = crypto.randomBytes(6).toString('base64url');
  flashes.set(id, list);
  setTimeout(() => flashes.delete(id), 5 * 60e3).unref();
  return id;
}

/** Handles /admin…; returns false for any other path. */
export async function adminRoutes(req, res, url, { opts, renderPage, onChange }) {
  const p = url.pathname;
  if (p !== '/admin' && !p.startsWith('/admin/')) return false;
  const post = req.method === 'POST';
  if (post && !sameOrigin(req)) { page(res, 403, 'This form came from another site.'); return true; }

  if (p === '/admin/login' && post) {
    const ip = clientIp(req);
    if (tooManyAttempts(ip)) { loginPage(res, opts, { error: 'Too many attempts. Wait 15 minutes and try again.', status: 429 }); return true; }
    const form = await readForm(req);
    if (!checkPassword(form.password || '')) {
      noteFailure(ip);
      loginPage(res, opts, { error: 'Wrong password.', status: 401 });
      return true;
    }
    clearFailures(ip);
    redirect(res, '/admin', 303, { 'Set-Cookie': sessionCookie(req, makeSession()), ...ADMIN_HEADERS });
    return true;
  }

  const sess = session(req);
  if (!sess) {
    if (post) { redirect(res, '/admin', 303, ADMIN_HEADERS); return true; }
    loginPage(res, opts);
    return true;
  }

  if (post) {
    const form = await readForm(req);
    if (!csrfOk(sess, form.csrf)) { page(res, 403, 'This form has expired. Go back, reload the admin page and try again.'); return true; }

    if (p === '/admin/logout') { redirect(res, '/admin', 303, { 'Set-Cookie': sessionCookie(req, '', 0), ...ADMIN_HEADERS }); return true; }

    if (p === '/admin/save') {
      const { content, warnings } = normalize(formToContent(form));
      save(content);
      onChange();
      const list = [{ text: 'Saved. The site shows the changes now.' }, ...warnings.map((text) => ({ text, kind: 'warn' }))];
      redirect(res, `/admin?m=${keepFlash(list)}`, 303, ADMIN_HEADERS);
      return true;
    }

    if (p === '/admin/preview') {
      const { content } = normalize(formToContent(form));
      const label = `your unsaved changes with the ${DESIGNS[content.design]} design. Close this tab to go back to the editor.`;
      send(res, 200, renderPage(content, { ...opts, preview: label }), { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
      return true;
    }

    if (p === '/admin/restore') {
      const ok = restore(String(form.name || ''));
      if (ok) onChange();
      redirect(res, `/admin?m=${keepFlash([ok ? { text: 'That version is back on the site.' } : { text: 'That version could not be found.', kind: 'err' }])}`, 303, ADMIN_HEADERS);
      return true;
    }

    page(res, 404, 'Not found');
    return true;
  }

  if (p === '/admin' || p === '/admin/') {
    editorPage(res, opts, sess, { flash: flashes.get(url.searchParams.get('m') || '') || [] });
    return true;
  }

  if (p === '/admin/preview') {
    const design = Object.hasOwn(DESIGNS, url.searchParams.get('design')) ? url.searchParams.get('design') : load().design;
    const label = `the ${DESIGNS[design]} design with the saved texts. Close this tab to go back to the editor.`;
    send(res, 200, renderPage({ ...load(), design }, { ...opts, preview: label }), { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    return true;
  }

  if (p === '/admin/export') {
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    send(res, 200, `${JSON.stringify(load(), null, 2)}\n`, {
      ...ADMIN_HEADERS, 'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="luminescent-mastering-texts-${day}.json"`,
    });
    return true;
  }

  redirect(res, '/admin', 303, { ...SECURITY_HEADERS, ...ADMIN_HEADERS });
  return true;
}
