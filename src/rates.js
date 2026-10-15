// EUR → GEL conversion. Default source: Bank of Georgia commercial "Sell" rate
// (what the bank charges to sell EUR for lari). Fallback: National Bank of Georgia official rate.
import { getSetting, setSetting } from './db.js';

const BOG_URL = 'https://api.businessonline.ge/api/rates/commercial/EUR';
const NBG_URL = 'https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/en/json/?currencies=EUR';
const CACHE_MS = 60 * 60 * 1000; // refresh hourly

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function fetchBog() {
  const j = await fetchJson(BOG_URL);
  const v = Number(j.Sell ?? j.sell);
  if (!(v > 0)) throw new Error('No BoG sell rate');
  return { rate: v, source: 'Bank of Georgia (commercial sell rate)' };
}
async function fetchNbg() {
  const j = await fetchJson(NBG_URL);
  const c = j?.[0]?.currencies?.find((x) => x.code === 'EUR');
  const v = c ? Number(c.rate) / Number(c.quantity || 1) : 0;
  if (!(v > 0)) throw new Error('No NBG rate');
  return { rate: v, source: 'National Bank of Georgia (official rate)' };
}

let inflight = null;
/** Refresh the cached bank rate. Never throws; keeps the last good value on failure. */
export async function refreshRate(force = false) {
  const mode = getSetting('rate_mode');
  if (mode === 'manual') return;
  const fetchedAt = Number(getSetting('rate_cache_at') || 0);
  if (!force && Date.now() - fetchedAt < CACHE_MS && Number(getSetting('rate_cache')) > 0) return;
  if (inflight) return inflight;
  inflight = (async () => {
    const order = mode === 'nbg' ? [fetchNbg, fetchBog] : [fetchBog, fetchNbg];
    for (const fn of order) {
      try {
        const { rate, source } = await fn();
        setSetting('rate_cache', rate);
        setSetting('rate_cache_source', source);
        setSetting('rate_cache_at', Date.now());
        setSetting('rate_error', '');
        return;
      } catch (e) { setSetting('rate_error', `${fn.name}: ${e.message}`); }
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/** The rate actually used for prices: bank (or manual) rate plus the shop's markup. */
export function currentRate() {
  const mode = getSetting('rate_mode');
  const markup = Number(getSetting('rate_markup') || 0);
  let base, source, at;
  const cached = Number(getSetting('rate_cache'));
  if (mode === 'manual' || !(cached > 0)) {
    base = Number(getSetting('rate_manual')) || 2.95;
    source = mode === 'manual' ? 'Manual rate' : 'Manual rate (bank rate unavailable)';
    at = null;
  } else {
    base = cached;
    source = getSetting('rate_cache_source');
    at = Number(getSetting('rate_cache_at')) || null;
  }
  const rate = Math.round(base * (1 + markup / 100) * 10000) / 10000;
  return { base, rate, markup, source, at };
}

/** GEL price for a product, honouring a fixed GEL price and the rounding step. */
export function gelPrice(product, rate = currentRate().rate) {
  if (product.price_gel_fixed != null && product.price_gel_fixed !== '' && Number(product.price_gel_fixed) > 0) {
    return Number(product.price_gel_fixed);
  }
  const step = Number(getSetting('gel_rounding')) || 1;
  return Math.ceil((Number(product.price_eur || 0) * rate) / step) * step;
}
export function priceIn(product, currency, rate) {
  return currency === 'EUR' ? Number(product.price_eur || 0) : gelPrice(product, rate);
}
