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

  it('passes params through to the URL', async () => {
    let capturedUrl = null;
    _setFetch(async url => {
      capturedUrl = url;
      return { text: async () => JSON.stringify({ features: [] }), status: 200 };
    });
    await fetchArcGISPage('https://x.com/FS/0', { where: '1=1', outFields: 'A,B' });
    assert.ok(capturedUrl.includes('where='), 'url has where param');
    assert.ok(capturedUrl.includes('outFields='), 'url has outFields param');
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

  it('advances offset correctly across pages', async () => {
    const capturedOffsets = [];
    let call = 0;
    _setFetch(async url => {
      const m = url.match(/resultOffset=(\d+)/);
      if (m) capturedOffsets.push(Number(m[1]));
      const rows = call++ < 2 ? [{ id: call }, { id: call }] : []; // 2 full pages then empty
      return { text: async () => JSON.stringify(arcgisBody(rows)), status: 200 };
    });
    for await (const _ of paginateArcGIS('https://x.com/FS/0', {}, { pageSize: 2, delayMs: 0 })) {}
    assert.deepEqual(capturedOffsets, [0, 2, 4]);
  });
});

// ── URL encoding ──────────────────────────────────────────────────────────────
// ArcGIS requires spaces as %20 and = signs preserved in where values.
// URLSearchParams encodes spaces as + and = as %3D — both cause 400 errors.

describe('ArcGIS query string encoding', () => {
  it('URLSearchParams encodes spaces as + (the bug)', () => {
    const usp = new URLSearchParams({ orderByFields: 'EstablishmentID ASC' }).toString();
    assert.ok(usp.includes('+'), `URLSearchParams space encoding: ${usp}`);
    assert.ok(!usp.includes('%20'), 'URLSearchParams does NOT produce %20');
  });

  it('URLSearchParams encodes = as %3D in values (the bug)', () => {
    const usp = new URLSearchParams({ where: '1=1' }).toString();
    assert.ok(usp.includes('1%3D1'), `URLSearchParams produces: ${usp}`);
  });

  it('encodeURIComponent encodes = as %3D (also the bug)', () => {
    assert.equal(encodeURIComponent('1=1'), '1%3D1');
  });

  it('fetchArcGISPage produces %20 for spaces (not +)', async () => {
    let capturedUrl = null;
    _setFetch(async url => {
      capturedUrl = url;
      return { text: async () => JSON.stringify({ features: [] }), status: 200 };
    });
    await fetchArcGISPage('https://x.com/FS/0', { orderByFields: 'EstablishmentID ASC' });
    assert.ok(capturedUrl.includes('%20'), `expected %20 in: ${capturedUrl}`);
    assert.ok(!capturedUrl.includes('+'),  `must not have + in: ${capturedUrl}`);
  });

  it('fetchArcGISPage preserves = in where clause values', async () => {
    let capturedUrl = null;
    _setFetch(async url => {
      capturedUrl = url;
      return { text: async () => JSON.stringify({ features: [] }), status: 200 };
    });
    await fetchArcGISPage('https://x.com/FS/0', { where: '1=1' });
    assert.ok(capturedUrl.includes('where=1'), `where param present in: ${capturedUrl}`);
    assert.ok(!capturedUrl.includes('1%3D1'),  `= must not be encoded as %3D in: ${capturedUrl}`);
  });

  it('multi-field orderByFields encodes all spaces correctly', async () => {
    let capturedUrl = null;
    _setFetch(async url => {
      capturedUrl = url;
      return { text: async () => JSON.stringify({ features: [] }), status: 200 };
    });
    await fetchArcGISPage('https://x.com/FS/0', { orderByFields: 'InspectionDate ASC, InspectionID ASC' });
    assert.ok(!capturedUrl.includes('+'), `no + encoding in: ${capturedUrl}`);
    // Both spaces should be %20
    const count = (capturedUrl.match(/%20/g) || []).length;
    assert.ok(count >= 2, `expected at least 2 %20 encodings, got ${count} in: ${capturedUrl}`);
  });

  it('commas in outFields are NOT encoded (ArcGIS requires raw commas)', async () => {
    let capturedUrl = null;
    _setFetch(async url => {
      capturedUrl = url;
      return { text: async () => JSON.stringify({ features: [] }), status: 200 };
    });
    await fetchArcGISPage('https://x.com/FS/0', { outFields: 'A,B,C' });
    assert.ok(capturedUrl.includes('A,B,C'), `commas must be raw in: ${capturedUrl}`);
    assert.ok(!capturedUrl.includes('%2C'), `%2C must not appear in: ${capturedUrl}`);
  });
});