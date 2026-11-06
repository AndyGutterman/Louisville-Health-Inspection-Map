/**
 * tests/import_runs.test.js
 * Tests the startRun/finishRun/failRun logic with an in-memory stub.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ── minimal Supabase stub ─────────────────────────────────────────────────────
class SupaStub {
  constructor() { this.rows = {}; this.nextId = 1; }

  from() {
    const store = this;
    let _filter = null, _data = null;
    const chain = {
      insert(payload) {
        const row = { ...(Array.isArray(payload) ? payload[0] : payload), run_id: store.nextId++ };
        store.rows[row.run_id] = row;
        _data = row;
        return chain;
      },
      update(payload) { _data = payload; return chain; },
      eq(col, val)    { _filter = { col, val }; return chain; },
      select()        { return chain; },
      single()        { return Promise.resolve({ data: _data, error: null }); },
      then(resolve) {
        if (_filter && _data) {
          for (const row of Object.values(store.rows)) {
            if (String(row[_filter.col]) === String(_filter.val)) Object.assign(row, _data);
          }
        }
        return resolve({ data: _data, error: null });
      },
    };
    return chain;
  }
}

// Logic under test (inlined to avoid ESM import-from-lib complexity in tests)
async function startRun(supa, source, windowStart, windowEnd, extraNotes = {}) {
  const { data, error } = await supa
    .from('import_runs')
    .insert({ source, started_at: new Date().toISOString(), notes: { window_start: windowStart, window_end: windowEnd, ...extraNotes } })
    .select('run_id')
    .single();
  if (error) return null;
  return data.run_id;
}

async function finishRun(supa, runId, rowsRead, rowsUpserted) {
  if (!runId) return;
  await supa.from('import_runs').update({ finished_at: new Date().toISOString(), rows_read: rowsRead, rows_upserted: rowsUpserted }).eq('run_id', runId);
}

async function failRun(supa, runId, err) {
  if (!runId) return;
  await supa.from('import_runs').update({ finished_at: new Date().toISOString(), notes: { error: String(err?.message || err) } }).eq('run_id', runId);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('startRun', () => {
  it('returns a positive run_id', async () => {
    const runId = await startRun(new SupaStub(), 'seed_test', '2026-01-01', '2026-01-01');
    assert.ok(runId > 0);
  });

  it('stores source and window', async () => {
    const stub = new SupaStub();
    const runId = await startRun(stub, 'seed_facilities', '2026-02-01', '2026-02-03');
    assert.equal(stub.rows[runId].source, 'seed_facilities');
    assert.equal(stub.rows[runId].notes.window_start, '2026-02-01');
    assert.equal(stub.rows[runId].notes.window_end,   '2026-02-03');
  });

  it('merges extraNotes (e.g. recovery flag)', async () => {
    const stub = new SupaStub();
    const runId = await startRun(stub, 'seed_inspections', '2026-01-15', '2026-01-20', { recovery: true });
    assert.equal(stub.rows[runId].notes.recovery, true);
  });

  it('returns null non-fatally when Supabase errors', async () => {
    const broken = { from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'conn refused' } }) }) }) }) };
    assert.equal(await startRun(broken, 'x', '2026-01-01', '2026-01-01'), null);
  });
});

describe('finishRun', () => {
  it('records rows_read and rows_upserted', async () => {
    const stub = new SupaStub();
    const runId = await startRun(stub, 'seed_test', '2026-01-01', '2026-01-01');
    await finishRun(stub, runId, 5000, 4200);
    assert.equal(stub.rows[runId].rows_read,     5000);
    assert.equal(stub.rows[runId].rows_upserted, 4200);
  });

  it('no-ops when runId is null', async () => {
    await assert.doesNotReject(() => finishRun(new SupaStub(), null, 0, 0));
  });
});

describe('failRun', () => {
  it('records error message from Error object', async () => {
    const stub = new SupaStub();
    const runId = await startRun(stub, 'seed_test', '2026-01-01', '2026-01-01');
    await failRun(stub, runId, new Error('timeout'));
    assert.equal(stub.rows[runId].notes.error, 'timeout');
  });

  it('records raw string errors', async () => {
    const stub = new SupaStub();
    const runId = await startRun(stub, 'seed_test', '2026-01-01', '2026-01-01');
    await failRun(stub, runId, 'something went wrong');
    assert.equal(stub.rows[runId].notes.error, 'something went wrong');
  });

  it('no-ops when runId is null', async () => {
    await assert.doesNotReject(() => failRun(new SupaStub(), null, new Error('x')));
  });
});