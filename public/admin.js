(function () {
  // Confirm dangerous actions
  document.querySelectorAll('form[data-confirm]').forEach((f) => f.addEventListener('submit', (e) => { if (!confirm(f.dataset.confirm)) e.preventDefault(); }));
  document.querySelectorAll('[data-confirm-btn]').forEach((b) => b.addEventListener('click', (e) => { if (!confirm(b.dataset.confirmBtn)) e.preventDefault(); }));
  document.querySelectorAll('input[data-abs]').forEach((i) => { i.value = location.origin + i.value; i.addEventListener('focus', () => i.select()); });

  // Resize big photos in the browser before upload (max 2400px, WebP), keep SVG/GIF as they are.
  async function prepare(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return file;
    const max = 2400, scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5e6) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob((b) => r(b || file), 'image/webp', 0.88));
  }
  async function upload(file) {
    const body = await prepare(file);
    const r = await fetch('/admin/upload', { method: 'POST', body, headers: { 'Content-Type': 'application/octet-stream' } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'Upload failed');
    return j.url;
  }

  // Product photo list
  const box = document.querySelector('[data-images]');
  if (box) {
    const field = box.querySelector('[data-images-field]'), list = box.querySelector('[data-img-list]'), status = box.querySelector('[data-upload-status]');
    let imgs = JSON.parse(field.value || '[]');
    const draw = () => {
      field.value = JSON.stringify(imgs);
      list.innerHTML = imgs.map((src, i) => `<li><img src="${src}" alt=""><div class="img-tools">
        <button type="button" data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move left">◀</button>
        <button type="button" data-rm data-i="${i}">Remove</button>
        <button type="button" data-mv="1" data-i="${i}" ${i === imgs.length - 1 ? 'disabled' : ''} aria-label="Move right">▶</button></div></li>`).join('');
    };
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const i = Number(b.dataset.i);
      if (b.hasAttribute('data-rm')) imgs.splice(i, 1);
      else { const j = i + Number(b.dataset.mv); [imgs[i], imgs[j]] = [imgs[j], imgs[i]]; }
      draw();
    });
    const handle = async (files) => {
      const arr = [...files].filter((f) => f.type.startsWith('image/'));
      for (let n = 0; n < arr.length; n++) {
        status.textContent = `Uploading ${n + 1} of ${arr.length}…`;
        try { imgs.push(await upload(arr[n])); draw(); } catch (err) { status.textContent = `${arr[n].name}: ${err.message}`; return; }
      }
      status.textContent = arr.length ? 'Uploaded. Save the product to keep the photos.' : '';
    };
    const drop = box.querySelector('[data-drop]');
    box.querySelector('[data-file]').addEventListener('change', (e) => { handle(e.target.files); e.target.value = ''; });
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); handle(e.dataTransfer.files); });
    draw();
  }

  // Single image fields (brand logo / photo)
  document.querySelectorAll('[data-single]').forEach((w) => {
    const field = w.querySelector('[data-single-field]'), prev = w.querySelector('[data-single-preview]');
    w.querySelector('[data-single-file]').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      prev.textContent = 'Uploading…';
      try { field.value = await upload(f); prev.innerHTML = `<img src="${field.value}" alt="">`; } catch (err) { prev.textContent = err.message; }
    });
    w.querySelector('[data-single-clear]').addEventListener('click', () => { field.value = ''; prev.innerHTML = ''; });
  });

  // Live GEL preview on the product form
  const form = document.querySelector('form[data-rate]');
  const eur = document.querySelector('[data-eur]'), out = document.querySelector('[data-gel-preview]');
  if (form && eur && out) {
    const rate = Number(form.dataset.rate), step = Number(form.dataset.rounding) || 1;
    const parse = (v) => { let s = String(v).replace(/[^\d.,]/g, ''); if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); else if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, ''); return Number(s) || 0; };
    const upd = () => { const v = parse(eur.value); out.textContent = v ? `≈ ${(Math.ceil(v * rate / step) * step).toLocaleString('en-US')} ₾ at today's rate (${rate.toFixed(4)})` : ''; };
    eur.addEventListener('input', upd); upd();
  }

  // CSV file → textarea
  const csvFile = document.querySelector('[data-csv-file]'), csvText = document.querySelector('[data-csv-text]');
  if (csvFile && csvText) csvFile.addEventListener('change', async () => {
    const f = csvFile.files[0]; if (!f) return;
    const buf = await f.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buf);
    if (text.includes('\uFFFD')) text = new TextDecoder('windows-1252').decode(buf); // older Excel exports
    csvText.value = text;
  });

  // Gallery: upload several photos, then submit them in one go
  const gform = document.querySelector('[data-gallery-add]');
  if (gform) {
    const gfile = gform.querySelector('[data-gallery-file]'), gstatus = gform.querySelector('[data-gallery-status]');
    const run = async (files) => {
      const arr = [...files].filter((f) => f.type.startsWith('image/')), urls = [];
      for (let n = 0; n < arr.length; n++) {
        gstatus.textContent = `Uploading ${n + 1} of ${arr.length}…`;
        try { urls.push(await upload(arr[n])); } catch (err) { gstatus.textContent = `${arr[n].name}: ${err.message}`; return; }
      }
      if (!urls.length) return;
      gform.querySelector('[data-gallery-images]').value = JSON.stringify(urls);
      gstatus.textContent = 'Saving…'; gform.submit();
    };
    gfile.addEventListener('change', () => run(gfile.files));
    const drop = gform.querySelector('.drop');
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); run(e.dataTransfer.files); });
  }
})();
