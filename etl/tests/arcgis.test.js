/**
 * tests/arcgis.test.js
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchArcGISPage, paginateArcGIS, _setFetch, _resetFetch } from '../lib/arcgis.js';

afterEach(() => _resetFetch());

const arcgisBody  = attrs  => ({ features: attrs.map(a => ({ attributes: a })) });
const stubFetch   = body   => _setFetch(async () => ({ text: async () => JSON.stringify(body), status: 200 }));
const errorFetch  = status => _setFetch(async () => ({ text: async () => '<html>error</html>', status }));

// ── fetchArcGISPage ───────────────────────────────────────────────────────────

describe('fetchArcGISPage', () => {
  it('returns attribute objects on success', async () => {
    const rows = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    stubFetch(arcgisBody(rows));
    assert.deepEqual(await fetchArcGISPage('https://x.com/FS/0', {}), rows);
  });

  it('returns empty array for empty feature list', async () => {
    stubFetch({ features: [] });
    assert.deepEqual(await fetchArcGISPage('https://x.com/FS/0', {}), []);
  });

  it('throws on ArcGIS error object', async () => {
    stubFetch({ error: { code: 400, message: 'bad request' } });
    await assert.rejects(
      () => fetchArcGISPage('https://x.com/FS/0', {}, 1, 1),
      /bad request/,
    );
  });

  it('throws on non-JSON response (e.g. 503 HTML)', async () => {
    errorFetch(503);
    await assert.rejects(
      () => fetchArcGISPage('https://x.com/FS/0', {}, 1, 1),
      /HTTP 503/,
    );
  });

  it('retries up to maxAttempts then throws', async () => {
    let calls = 0;
    _setFetch(async () => {
      calls++;
      return { text: async () => JSON.stringify({ error: { message: 'server error' } }), status: 200 };
    });
    await assert.rejects(
      () => fetchArcGISPage('https://x.com/FS/0', {}, 1, 3),
      /server error/,
    );
    assert.equal(calls, 3);
  });

  it('throws immediately on 499 auth error without retrying', async () => {
    let calls = 0;
    _setFetch(async () => {
      calls++;
      return { text: async () => JSON.stringify({ error: { code: 499, message: 'Token Required' } }), status: 200 };
    });
    await assert.rejects(
      () => fetchArcGISPage('https://x.com/FS/0', {}, 1, 1),
      /Token Required/,
    );
    assert.equal(calls, 1, 'should not retry a 499 auth error');
  });
});

// ── paginateArcGIS ────────────────────────────────────────────────────────────

describe('paginateArcGIS', () => {
  it('yields one page when response is smaller than pageSize', async () => {
    stubFetch(arcgisBody([{ id: 1 }, { id: 2 }]));
    const pages = [];
    for await (const p of paginateArcGIS('https://x.com/FS/0', {}, { pageSize: 100, delayMs: 0 })) {
      pages.push(p);
    }
    assert.equal(pages.length, 1);
    assert.equal(pages[0].page, 1);
    assert.equal(pages[0].offset, 0);
  });

  it('yields multiple pages, stops when page is short', async () => {
    const full  = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const short = [{ id: 99 }];
    let call = 0;
    _setFetch(async () => ({
      text: async () => JSON.stringify(arcgisBody(call++ === 0 ? full : short)),
      status: 200,
    }));
    const pages = [];
    for await (const p of paginateArcGIS('https://x.com/FS/0', {}, { pageSize: 3, delayMs: 0 })) {
      pages.push(p);
    }
    assert.equal(pages.length, 2);
    assert.equal(pages[1].offset, 3);
  });

  it('stops immediately on empty first page', async () => {
    stubFetch({ features: [] });
    const pages = [];
    for await (const p of paginateArcGIS('https://x.com/FS/0', {}, { pageSize: 10, delayMs: 0 })) pages.push(p);
    assert.equal(pages.length, 0);
  });

  it('propagates errors from fetchArcGISPage', async () => {
    stubFetch({ error: { message: 'quota exceeded' } });
    await assert.rejects(async () => {
      for await (const _ of paginateArcGIS('https://x.com/FS/0', {}, { pageSize: 10, delayMs: 0, maxAttempts: 1 })) { }
    }, /quota exceeded/);
  });

  it('may yield duplicate ids across pages (caller must deduplicate)', async () => {
    const page1 = [{ EstablishmentID: 100 }, { EstablishmentID: 101 }];
    const page2 = [{ EstablishmentID: 100 }];
    let call = 0;
    _setFetch(async () => ({
      text: async () => JSON.stringify(arcgisBody(call++ === 0 ? page1 : page2)),
      status: 200,
    }));
    const allAttrs = [];
    for await (const { attrs } of paginateArcGIS('https://x.com/FS/0', {}, { pageSize: 2, delayMs: 0 })) {
      allAttrs.push(...attrs);
    }
    assert.ok(allAttrs.filter(a => a.EstablishmentID === 100).length > 1, 'duplicates present — caller must deduplicate');
  });
});

// ── URL encoding regression ───────────────────────────────────────────────────
// ArcGIS requires unencoded query strings. URLSearchParams and encodeURIComponent
// both encode = as %3D, which causes "Invalid query parameters" 400 errors.

describe('ArcGIS query string encoding', () => {
  it('URLSearchParams encodes = as %3D (the bug)', () => {
    const usp = new URLSearchParams({ where: '1=1' }).toString();
    assert.ok(usp.includes('1%3D1'), `URLSearchParams produces: ${usp}`);
  });

  it('encodeURIComponent also encodes = as %3D (same bug)', () => {
    assert.equal(encodeURIComponent('1=1'), '1%3D1');
  });

  it('correct approach: raw concatenation preserves = in where clause', () => {
    const qs = Object.entries({ where: '1=1', f: 'json' })
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    assert.equal(qs, 'where=1=1&f=json');
  });
});

  it('space-only encoding produces valid ArcGIS query string', () => {
    const buildQS = params => Object.entries(params)
      .map(([k, v]) => `${k}=${String(v).replace(/ /g, '%20')}`)
      .join('&');
    const qs = buildQS({ where: '1=1', orderByFields: 'EstablishmentID ASC', f: 'json' });
    assert.ok(qs.includes('where=1=1'),                   'where = preserved');
    assert.ok(qs.includes('orderByFields=EstablishmentID%20ASC'), 'space encoded as %20');
    assert.ok(!qs.includes('1%3D1'),                      'no %3D encoding');
  });