/**
 * tests/arcgis.test.js
 * Run: node --test tests/arcgis.test.js
 */
import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchArcGISPage, paginateArcGIS, _setFetch, _resetFetch } from '../lib/arcgis.js';

afterEach(() => _resetFetch());

// ── helpers ───────────────────────────────────────────────────────────────────

function stubFetch(body) {
  _setFetch(async () => ({ text: async () => JSON.stringify(body), status: 200 }));
}

function arcgisBody(attrs) {
  return { features: attrs.map(a => ({ attributes: a })) };
}

// ── fetchArcGISPage ───────────────────────────────────────────────────────────

describe('fetchArcGISPage', () => {
  it('returns attribute objects from a successful response', async () => {
    const expected = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    stubFetch(arcgisBody(expected));
    const result = await fetchArcGISPage('https://example.com/FS/0', { where: '1=1' });
    assert.deepEqual(result, expected);
  });

  it('returns empty array for an empty feature list', async () => {
    stubFetch({ features: [] });
    const result = await fetchArcGISPage('https://example.com/FS/0', {});
    assert.deepEqual(result, []);
  });

  it('throws when ArcGIS returns an error object', async () => {
    stubFetch({ error: { code: 400, message: 'bad request' } });
    await assert.rejects(
      () => fetchArcGISPage('https://example.com/FS/0', {}, 1, 1),
      /bad request/,
    );
  });

  it('throws when response is not JSON', async () => {
    _setFetch(async () => ({ text: async () => '<html>oops</html>', status: 503 }));
    await assert.rejects(
      () => fetchArcGISPage('https://example.com/FS/0', {}, 1, 1),
      /HTTP 503/,
    );
  });

  it('retries on error and eventually throws', async () => {
    let calls = 0;
    _setFetch(async () => {
      calls++;
      return { text: async () => JSON.stringify({ error: { message: 'server error' } }), status: 200 };
    });
    await assert.rejects(
      () => fetchArcGISPage('https://example.com/FS/0', {}, 1, 3),
      /server error/,
    );
    assert.equal(calls, 3, 'should have retried up to maxAttempts');
  });
});

// ── paginateArcGIS ────────────────────────────────────────────────────────────

describe('paginateArcGIS', () => {
  it('yields a single page when response is smaller than pageSize', async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    stubFetch(arcgisBody(rows));
    const pages = [];
    for await (const p of paginateArcGIS('https://example.com/FS/0', { where: '1=1' }, { pageSize: 100, delayMs: 0 })) {
      pages.push(p);
    }
    assert.equal(pages.length, 1);
    assert.deepEqual(pages[0].attrs, rows);
    assert.equal(pages[0].page, 1);
    assert.equal(pages[0].offset, 0);
  });

  it('yields multiple pages and stops when a page is short', async () => {
    const fullPage  = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const shortPage = [{ id: 99 }];
    let call = 0;
    _setFetch(async () => ({
      text: async () => JSON.stringify(arcgisBody(call++ === 0 ? fullPage : shortPage)),
      status: 200,
    }));
    const pages = [];
    for await (const p of paginateArcGIS('https://example.com/FS/0', {}, { pageSize: 3, delayMs: 0 })) {
      pages.push(p);
    }
    assert.equal(pages.length, 2);
    assert.equal(pages[0].attrs.length, 3);
    assert.equal(pages[1].attrs.length, 1);
    assert.equal(pages[1].offset, 3);
  });

  it('stops immediately on empty first page', async () => {
    stubFetch({ features: [] });
    const pages = [];
    for await (const p of paginateArcGIS('https://example.com/FS/0', {}, { pageSize: 10, delayMs: 0 })) {
      pages.push(p);
    }
    assert.equal(pages.length, 0);
  });

  it('propagates errors thrown by fetchArcGISPage', async () => {
    stubFetch({ error: { message: 'quota exceeded' } });
    await assert.rejects(async () => {
      for await (const _ of paginateArcGIS('https://example.com/FS/0', {}, { pageSize: 10, delayMs: 0, maxAttempts: 1 })) { /* noop */ }
    }, /quota exceeded/);
  });
});