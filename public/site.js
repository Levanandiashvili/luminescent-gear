// Cart lives in localStorage as [{id, qty}]; prices always come from the server.
(function () {
  const KEY = 'cart';
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const write = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} updateCount(); };
  const lang = document.documentElement.lang;

  function updateCount() {
    const n = read().reduce((s, l) => s + (l.qty | 0), 0);
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = n; el.toggleAttribute('data-zero', n === 0); });
  }
  updateCount();

  const toastEl = document.querySelector('[data-toast]');
  let toastTimer;
  function toast(html) {
    if (!toastEl) return;
    toastEl.innerHTML = html; toastEl.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  document.querySelectorAll('[data-add]').forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = Number(form.dataset.id), qty = Math.max(1, Math.min(20, Number(form.qty.value) || 1));
    const v = form.variant ? Number(form.variant.value) || 0 : 0;
    const c = read(); const line = c.find((l) => l.id === id && (l.v || 0) === v);
    if (line) line.qty = Math.min(20, line.qty + qty); else c.push({ id, v, qty });
    write(c);
    toast(lang === 'ka' ? 'დაემატა კალათაში <a href="/cart">კალათა</a>' : 'Added to cart <a href="/cart">View cart</a>');
  }));

  // Product gallery
  document.querySelectorAll('[data-gallery]').forEach((g) => {
    const main = g.querySelector('.gallery-main');
    g.querySelectorAll('.thumbs button').forEach((b) => b.addEventListener('click', () => {
      main.innerHTML = '';
      const img = new Image(); img.src = b.dataset.src; img.alt = ''; main.appendChild(img);
      g.querySelectorAll('.thumbs button').forEach((x) => x.setAttribute('aria-current', x === b));
    }));
  });

  // Cart page
  const root = document.querySelector('[data-cart-root]');
  if (root) {
    const i18n = JSON.parse(root.dataset.i18n);
    const form = document.querySelector('[data-checkout]');
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmt = (n, cur) => {
      const d = cur === 'EUR' && Math.round(n) !== n ? 2 : 0;
      const s = new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
      return cur === 'EUR' ? '€' + s : s + ' ₾';
    };
    async function render() {
      const cart = read();
      if (!cart.length) { root.innerHTML = `<p class="empty">${esc(i18n.empty)}</p><p><a class="btn" href="/catalog">${esc(i18n.continue)}</a></p>`; form.hidden = true; return; }
      const key = (l) => l.id + ':' + (l.v || 0);
      const r = await fetch('/api/cart?ids=' + cart.map(key).join(','));
      const data = await r.json();
      const byKey = new Map(data.items.map((p) => [p.key, p]));
      const valid = cart.filter((l) => byKey.get(key(l)) && byKey.get(key(l)).orderable);
      if (valid.length !== cart.length) write(valid);
      if (!valid.length) return render();
      let total = 0;
      root.innerHTML = `<ul class="cart-lines">${valid.map((l) => {
        const p = byKey.get(key(l)); const lt = p.price * l.qty; total += lt;
        return `<li class="cart-line" data-id="${p.id}" data-v="${l.v || 0}">
          <a class="thumb" href="/p/${esc(p.slug)}">${p.image ? `<img src="${esc(p.image)}" alt="">` : p.placeholder}</a>
          <div><p class="card-brand">${esc(p.brand || '')}</p><a class="card-title" href="/p/${esc(p.slug)}">${esc(p.name)}</a>${p.option ? `<p class="small">${esc(p.option)}</p>` : ''}<p class="muted small">${esc(p.priceText)}</p></div>
          <div class="qty-cell"><label class="sr" for="q${p.id}">${esc(i18n.qty)}</label><input id="q${p.id}" type="number" min="1" max="20" value="${l.qty}" data-qty>
            <button type="button" class="remove" data-remove>${esc(i18n.remove)}</button></div>
          <div class="line-total">${fmt(lt, data.currency)}</div></li>`;
      }).join('')}</ul>
      <div class="cart-total"><span>${esc(i18n.total)}</span><strong>${fmt(total, data.currency)}</strong></div>`;
      form.hidden = false;
      form.querySelector('[data-cart-field]').value = JSON.stringify(read());
    }
    root.addEventListener('change', (e) => {
      if (!e.target.matches('[data-qty]')) return;
      const el = e.target.closest('[data-id]'), id = Number(el.dataset.id), v = Number(el.dataset.v) || 0;
      const c = read(); const l = c.find((x) => x.id === id && (x.v || 0) === v);
      if (l) l.qty = Math.max(1, Math.min(20, Number(e.target.value) || 1));
      write(c); render();
    });
    root.addEventListener('click', (e) => {
      if (!e.target.matches('[data-remove]')) return;
      const el = e.target.closest('[data-id]'), id = Number(el.dataset.id), v = Number(el.dataset.v) || 0;
      write(read().filter((l) => !(l.id === id && (l.v || 0) === v))); render();
    });
    render().catch(() => { root.innerHTML = '<p class="notice">Could not load the cart. Refresh the page to try again.</p>'; });

    // Company fields only when buying as a company
    const companyOnly = form.querySelectorAll('[data-company-only]');
    const sync = () => { const isCo = form.querySelector('input[name="type"]:checked').value === 'company'; companyOnly.forEach((el) => { el.hidden = !isCo; }); };
    form.addEventListener('change', (e) => { if (e.target.name === 'type') sync(); });
    sync();
    form.addEventListener('submit', (e) => {
      form.querySelector('[data-cart-field]').value = JSON.stringify(read());
      const btn = form.querySelector('button[type="submit"]');
      if (!form.checkValidity()) { e.preventDefault(); form.reportValidity(); return; }
      btn.disabled = true;
    });
  }
})();

// Studio gallery lightbox
(function () {
  const grid = document.querySelector('[data-lightbox]');
  const view = document.querySelector('[data-lightbox-view]');
  if (!grid || !view) return;
  const tiles = [...grid.querySelectorAll('.tile')];
  const img = view.querySelector('img'), cap = view.querySelector('figcaption');
  let i = 0, opener = null;
  const show = (n) => {
    i = (n + tiles.length) % tiles.length;
    const t = tiles[i];
    img.src = t.querySelector('img').src;
    img.alt = t.querySelector('img').alt;
    cap.textContent = [...t.querySelectorAll('figcaption span')].map((s) => s.textContent).join(' · ') + `  (${i + 1} / ${tiles.length})`;
  };
  const open = (n, btn) => { opener = btn; show(n); view.hidden = false; document.body.style.overflow = 'hidden'; view.querySelector('.lb-close').focus(); };
  const close = () => { view.hidden = true; document.body.style.overflow = ''; if (opener) opener.focus(); };
  grid.addEventListener('click', (e) => { const b = e.target.closest('button[data-index]'); if (b) open(Number(b.dataset.index), b); });
  view.addEventListener('click', (e) => {
    const a = e.target.closest('[data-lb]');
    if (a) { const k = a.dataset.lb; if (k === 'close') close(); else show(i + (k === 'next' ? 1 : -1)); }
    else if (e.target === view) close();
  });
  document.addEventListener('keydown', (e) => {
    if (view.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(i + 1);
    if (e.key === 'ArrowLeft') show(i - 1);
  });
})();
