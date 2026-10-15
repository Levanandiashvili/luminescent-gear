// Printable bank-transfer invoice. "Download PDF" uses the browser's print-to-PDF.
import { html } from './http.js';
import { allSettings } from './db.js';
import { translator } from './i18n.js';
import { fmtMoney } from './layout.js';

const en = translator('en');
const L = (k, vars) => en(k, vars);

export function invoicePage(c, o, { fresh = false, admin = false } = {}) {
  const s = allSettings();
  const cust = JSON.parse(o.customer);
  const items = JSON.parse(o.items);
  const vatRate = Number(s.vat_rate) || 18;
  const vat = s.vat_payer === '1' ? Math.round((o.total * vatRate / (100 + vatRate)) * 100) / 100 : 0;
  const iban = o.currency === 'EUR' ? (s.iban_eur || s.iban_gel) : (s.iban_gel || s.iban_eur);
  const date = o.created_at.slice(0, 10);
  const statusKey = o.status;
  const note = s.invoice_note;
  return html`<!doctype html>
<html lang="${c.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${o.number} — ${s.company_name}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/static/invoice.css?v=4">
</head><body>
<div class="bar no-print">
  ${fresh ? html`<div class="bar-msg"><strong>${c.t('invoice_ready')}</strong><p>${c.t('invoice_ready_text')}</p></div>` : ''}
  <div class="bar-actions">
    <button type="button" class="btn" onclick="window.print()">${c.t('print')}</button>
    ${admin ? html`<a class="link" href="/admin/orders/${o.id}">Back to order</a>` : html`<a class="link" href="/">${c.t('back_to_shop')}</a>`}
  </div>
</div>
${fresh ? html`<script>try{localStorage.removeItem('cart')}catch(e){}</script>` : ''}
<article class="sheet">
  <header class="inv-head">
    <div>
      <p class="seller-name">${s.company_name}</p>
      ${s.company_legal ? html`<p>${s.company_legal}</p>` : ''}
      ${s.company_id ? html`<p>ID ${s.company_id}</p>` : ''}
      <p>${s.company_address}</p>
      <p>${s.company_email} · ${s.company_phone}</p>
    </div>
    <div class="inv-title">
      <h1>${L('invoice')}</h1>
      <dl>
        <div><dt>${L('invoice_no')}</dt><dd>${o.number}</dd></div>
        <div><dt>${L('date')}</dt><dd>${date}</dd></div>
        ${o.due_at ? html`<div><dt>${L('valid_until')}</dt><dd>${o.due_at}</dd></div>` : ''}
        ${statusKey !== 'awaiting_payment' ? html`<div><dt>${L('status')}</dt><dd class="status">${L(statusKey)}</dd></div>` : ''}
      </dl>
    </div>
  </header>

  <section class="parties">
    <div>
      <h2>${L('buyer')}</h2>
      ${cust.company ? html`<p class="strong">${cust.company}</p>` : ''}
      <p class="${cust.company ? '' : 'strong'}">${cust.name}</p>
      ${cust.id_code ? html`<p>ID ${cust.id_code}</p>` : ''}
      ${cust.address || cust.city ? html`<p>${[cust.address, cust.city].filter(Boolean).join(', ')}</p>` : ''}
      <p>${cust.email}${cust.phone ? ` · ${cust.phone}` : ''}</p>
    </div>
    <div>
      <h2>${L('pay_to')}</h2>
      <dl class="bank">
        <div><dt>${L('beneficiary')}</dt><dd>${s.bank_beneficiary || s.company_legal || s.company_name}</dd></div>
        <div><dt>${L('bank')}</dt><dd>${s.bank_name}</dd></div>
        <div><dt>${L('iban')}</dt><dd class="mono">${iban || '—'}</dd></div>
        ${s.bank_swift ? html`<div><dt>${L('swift')}</dt><dd class="mono">${s.bank_swift}</dd></div>` : ''}
        <div><dt>${L('reference')}</dt><dd class="mono strong">${o.number}</dd></div>
      </dl>
    </div>
  </section>

  <table class="lines">
    <thead><tr><th>${L('item')}</th><th class="num">${L('qty')}</th><th class="num">${L('unit_price')}</th><th class="num">${L('amount')}</th></tr></thead>
    <tbody>${items.map((i) => html`<tr><td>${i.name}${i.sku ? html`<span class="sku">${i.sku}</span>` : ''}</td><td class="num">${i.qty}</td><td class="num">${fmtMoney(i.unit, o.currency)}</td><td class="num">${fmtMoney(i.total, o.currency)}</td></tr>`)}</tbody>
    <tfoot>
      <tr class="grand"><th colspan="3">${L('total')}</th><td class="num">${fmtMoney(o.total, o.currency)}</td></tr>
      <tr><td colspan="4" class="vat">${s.vat_payer === '1' ? html`${L('vat_included', { rate: vatRate })}: ${fmtMoney(vat, o.currency)}` : L('vat_none')}</td></tr>
    </tfoot>
  </table>

  <footer class="inv-foot">
    ${note ? html`<p>${note}</p>` : ''}
    <p class="muted">1 EUR = ${o.rate.toFixed(4)} GEL · ${o.rate_source} · ${date}</p>
  </footer>
</article>
</body></html>`.toString();
}
