// Drawn stand-ins shown until real product photos are uploaded.
// Each product gets a stable variation from its slug, so the catalog doesn't look like a wall of identical boxes.
function seeded(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
}

function rackUnit(slug, label) {
  const r = seeded(slug);
  const units = r() > 0.55 ? 2 : 1;
  const h = units === 2 ? 180 : 110, y0 = (300 - h) / 2;
  const knobs = 2 + Math.floor(r() * 4);
  const hasMeter = r() > 0.4;
  const pairs = r() > 0.5; // stereo units show two rows
  const parts = [];
  // ears + faceplate
  parts.push(`<rect x="20" y="${y0}" width="560" height="${h}" rx="3" fill="var(--ph-plate)"/>`);
  parts.push(`<rect x="20" y="${y0}" width="560" height="${h}" rx="3" fill="url(#brush)" opacity=".5"/>`);
  for (const x of [34, 566]) for (const yy of [y0 + 16, y0 + h - 16]) parts.push(`<ellipse cx="${x}" cy="${yy}" rx="5" ry="3.4" fill="var(--ph-bg)"/>`);
  let x = 82;
  if (hasMeter) {
    const mh = Math.min(h - 50, 90), mw = mh * 1.35, my = y0 + (h - mh) / 2;
    parts.push(`<rect x="${x}" y="${my}" width="${mw}" height="${mh}" rx="4" fill="var(--ph-meter)"/>`);
    const cx = x + mw / 2, cy = my + mh * 0.92, rr = mh * 0.7;
    parts.push(`<path d="M${cx - rr * 0.8} ${cy - rr * 0.6} A ${rr} ${rr} 0 0 1 ${cx + rr * 0.8} ${cy - rr * 0.6}" fill="none" stroke="var(--ph-ink)" stroke-width="1.2" opacity=".55"/>`);
    const ang = -0.9 + r() * 1.1;
    parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(ang) * rr * 0.95}" y2="${cy - Math.cos(ang) * rr * 0.95}" stroke="var(--ph-needle)" stroke-width="1.6"/>`);
    x += mw + 34;
  }
  const rows = pairs && units === 2 ? 2 : 1;
  const span = 560 - (x - 20) - 40;
  const gap = span / knobs;
  for (let row = 0; row < rows; row++) {
    const cy = rows === 2 ? y0 + h * (row === 0 ? 0.32 : 0.7) : y0 + h / 2;
    for (let i = 0; i < knobs; i++) {
      const cx = x + gap * (i + 0.5);
      const kr = Math.min(gap * 0.3, units === 2 && rows === 1 ? 30 : 20) * (i === knobs - 1 ? 1.15 : 1);
      const a = r() * Math.PI * 1.5 - Math.PI * 0.75;
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${kr + 5}" fill="none" stroke="var(--ph-ink)" stroke-width=".8" stroke-dasharray="1.5 3.2" opacity=".45"/>`);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${kr}" fill="var(--ph-knob)"/>`);
      parts.push(`<line x1="${cx}" y1="${cy}" x2="${cx + Math.sin(a) * kr * 0.8}" y2="${cy - Math.cos(a) * kr * 0.8}" stroke="var(--ph-plate)" stroke-width="2" stroke-linecap="round"/>`);
    }
  }
  parts.push(`<text x="42" y="${y0 + h - 10}" font-family="IBM Plex Sans, sans-serif" font-size="9" fill="var(--ph-ink)" opacity=".7">${label}</text>`);
  return parts.join('');
}

function desk(slug) {
  const r = seeded(slug);
  const bays = r() > 0.5 ? 2 : 1;
  const parts = [];
  parts.push(`<rect x="70" y="118" width="460" height="16" rx="2" fill="var(--ph-oak)"/>`); // top
  parts.push(`<rect x="70" y="134" width="460" height="5" fill="var(--ph-knob)" opacity=".5"/>`);
  // angled rack bays
  const bw = bays === 2 ? 120 : 150;
  const xs = bays === 2 ? [88, 392] : [225];
  for (const bx of xs) {
    parts.push(`<path d="M${bx} 118 L${bx + 10} 72 L${bx + bw - 10} 72 L${bx + bw} 118 Z" fill="var(--ph-plate)"/>`);
    for (let i = 0; i < 3; i++) parts.push(`<rect x="${bx + 16}" y="${80 + i * 11}" width="${bw - 32}" height="7" rx="1" fill="var(--ph-knob)" opacity="${0.35 + i * 0.15}"/>`);
  }
  // legs + lower racks
  parts.push(`<rect x="80" y="139" width="12" height="120" fill="var(--ph-knob)"/><rect x="508" y="139" width="12" height="120" fill="var(--ph-knob)"/>`);
  parts.push(`<rect x="110" y="170" width="110" height="88" rx="2" fill="var(--ph-oak)" opacity=".75"/><rect x="380" y="170" width="110" height="88" rx="2" fill="var(--ph-oak)" opacity=".75"/>`);
  for (const bx of [118, 388]) for (let i = 0; i < 4; i++) parts.push(`<rect x="${bx}" y="${178 + i * 19}" width="94" height="13" rx="1" fill="var(--ph-plate)"/>`);
  parts.push(`<rect x="60" y="259" width="480" height="3" fill="var(--ph-ink)" opacity=".15"/>`);
  return parts.join('');
}

function panel(slug) {
  const r = seeded(slug);
  const cols = 3 + Math.floor(r() * 3), parts = [];
  const w = 420 / cols;
  for (let c = 0; c < cols; c++) for (let row = 0; row < 3; row++) {
    const x = 90 + c * w, y = 50 + row * 68;
    const d = r();
    parts.push(`<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="62" rx="2" fill="${d > 0.66 ? 'var(--ph-oak)' : d > 0.33 ? 'var(--ph-plate)' : 'var(--ph-knob)'}" opacity="${d > 0.33 ? 1 : 0.8}"/>`);
    if (d > 0.66) for (let s = 1; s < 5; s++) parts.push(`<line x1="${x + 3 + (w - 6) * s / 5}" y1="${y + 6}" x2="${x + 3 + (w - 6) * s / 5}" y2="${y + 62}" stroke="var(--ph-ink)" stroke-width=".6" opacity=".35"/>`);
  }
  return parts.join('');
}

function nameplate(label, brand) {
  const size = label.length > 14 ? 48 : 64;
  return `<rect x="50" y="30" width="500" height="240" rx="4" fill="none" stroke="var(--ph-ink)" stroke-opacity=".18"/>
<text x="300" y="${150 + size * 0.3}" text-anchor="middle" font-family="Instrument Serif, Georgia, serif" font-size="${size}" fill="var(--ph-ink)">${label}</text>
<text x="300" y="236" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="15" fill="var(--ph-ink)" opacity=".5">${brand}</text>`;
}

export function placeholderSvg(product) {
  const kind = product.category_kind || 'gear';
  const label = String(product.name || '').replace(/[<&>]/g, '').slice(0, 40);
  const brand = String(product.brand_name || '').replace(/[<&>]/g, '');
  const body = kind === 'furniture' ? desk(product.slug) : kind === 'acoustics' ? panel(product.slug)
    : kind === 'other' ? nameplate(label.replace(/\s*\((set|pair)\)$/i, ''), brand) : rackUnit(product.slug, label);
  return `<svg class="ph" viewBox="0 0 600 300" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="brush" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>
${body}</svg>`;
}
