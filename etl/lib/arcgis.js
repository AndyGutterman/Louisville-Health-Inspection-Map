/**
 * lib/arcgis.js — ArcGIS FeatureServer fetch helpers.
 *
 * fetchArcGISPage   — single page, with exponential-backoff retry.
 * paginateArcGIS    — async generator; yields { attrs, offset, page } until exhausted.
 *
 * Usage:
 *   for await (const { attrs, page } of paginateArcGIS(BASE_URL, { where, outFields })) {
 *     // process attrs[]
 *   }
 */
import { sleep } from './utils.js';

// Module-level fetch reference. Starts null (lazy) so tests can inject a stub
// via _setFetch() before any real network call is made, meaning node-fetch is
// never imported during `npm test`.
let _fetch = null;

async function doFetch(url) {
  if (!_fetch) {
    const mod = await import('node-fetch');
    _fetch = mod.default;
  }
  return _fetch(url);
}

/** @internal Test seam — replace the fetch implementation used by this module. */
export function _setFetch(fn) { _fetch = fn; }
/** @internal Reset to lazy node-fetch (call in afterEach). */
export function _resetFetch() { _fetch = null; }

/**
 * Fetch one page from an ArcGIS FeatureServer query endpoint.
 *
 * @param {string} baseUrl
 * @param {object} params    — URLSearchParams-compatible key/value pairs
 * @param {number} [attempt]
 * @param {number} [maxAttempts]
 * @returns {Promise<object[]>} raw attribute objects
 */
export async function fetchArcGISPage(baseUrl, params, attempt = 1, maxAttempts = 4) {
  const qs   = new URLSearchParams({ returnGeometry: 'false', f: 'json', ...params });
  const res  = await doFetch(`${baseUrl}/query?${qs}`);
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

/**
 * Async generator that pages through all results from an ArcGIS query.
 *
 * @param {string} baseUrl
 * @param {object} baseParams    — where, outFields, orderByFields, etc.
 * @param {object} [opts]
 * @param {number} [opts.pageSize=2000]
 * @param {number} [opts.delayMs=80]
 * @param {number} [opts.maxAttempts=4]
 *
 * @yields {{ attrs: object[], offset: number, page: number }}
 */
export async function* paginateArcGIS(baseUrl, baseParams, {
  pageSize    = 2000,
  delayMs     = 80,
  maxAttempts = 4,
} = {}) {
  let offset = 0;
  let page   = 0;

  for (;;) {
    const attrs = await fetchArcGISPage(
      baseUrl,
      { ...baseParams, resultRecordCount: String(pageSize), resultOffset: String(offset) },
      1,
      maxAttempts,
    );
    if (!attrs.length) break;

    yield { attrs, offset, page: ++page };

    if (attrs.length < pageSize) break;
    offset += pageSize;
    await sleep(delayMs);
  }
}