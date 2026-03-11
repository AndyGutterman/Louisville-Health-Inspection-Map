/**
 * lib/arcgis.js — ArcGIS FeatureServer fetch helpers.
 *
 * fetchArcGISPage   — single page, with exponential-backoff retry.
 * paginateArcGIS    — async generator; yields { attrs, offset, page } until exhausted.
 */
import { sleep } from './utils.js';

let _fetch = null;

async function doFetch(url) {
  if (!_fetch) { const mod = await import('node-fetch'); _fetch = mod.default; }
  return _fetch(url);
}

export function _setFetch(fn) { _fetch = fn; }
export function _resetFetch() { _fetch = null; }

export async function fetchArcGISPage(baseUrl, params, attempt = 1, maxAttempts = 4) {
const qs  = new URLSearchParams({ returnGeometry: 'false', f: 'json', ...params });
const url = `${baseUrl}/query?${qs}`;
console.log('DEBUG URL:', url);  // ← add this
const res = await doFetch(url);
  const text = await res.text();

  let j;
  try { j = JSON.parse(text); } catch (_) { j = null; }

  if (!j || j.error) {
    const msg = j?.error ? JSON.stringify(j.error) : `HTTP ${res.status}: non-JSON response`;
    if (attempt < maxAttempts) {
      console.warn(`  ArcGIS error @offset=${params.resultOffset ?? 0}, retry ${attempt}/${maxAttempts - 1}: ${msg}`);
      await sleep(1500 * attempt);
      return fetchArcGISPage(baseUrl, params, attempt + 1, maxAttempts);
    }
    throw new Error(msg);
  }

  return (j.features || []).map(f => f.attributes);
}

export async function* paginateArcGIS(baseUrl, baseParams, {
  pageSize    = 2000,
  delayMs     = 80,
  maxAttempts = 4,
} = {}) {
  let offset = 0, page = 0;

  for (;;) {
    const attrs = await fetchArcGISPage(
      baseUrl,
      { ...baseParams, resultRecordCount: String(pageSize), resultOffset: String(offset) },
      1, maxAttempts,
    );
    if (!attrs.length) break;
    yield { attrs, offset, page: ++page };
    if (attrs.length < pageSize) break;
    offset += pageSize;
    await sleep(delayMs);
  }
}