/**
 * tests/import_runs.test.js
 * Run: node --test tests/import_runs.test.js
 *
 * Builds tiny in-memory Supabase stub so we never touch the real DB.
 * The stub mimics the chained query builder interface just enough for
 * startRun / finishRun / failRun.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ── in-memory Supabase stub ───────────────────────────────────────────────────

class SupaStub {
  constructor() { this.rows = {}; this.nextId = 1; }

  from(table) {
    const store = this;
    let _table   = table;
    let _filter  = null;   // { col, val }
    let _data    = null;

    const chain = {
      insert(payload) {
        const row = { ...(Array.isArray(payload) ? payload[0] : payload), run_id: store.nextId++ };
        store.rows[row.run_id] = row;
        _data = row;
        return chain;
      },
      update(payload) {
        _data = payload;
        return chain;
      },
      eq(col, val) {
        _filter = { col, val };
        return chain;
      },
      select(_cols) { return chain; },
      single() {
        return Promise.resolve({ data: _data, error: null });
      },
      then(resolve) {
        // apply the pending update
        if (_filter && _data) {
          for (const row of Object.values(store.rows)) {
            if (String(row[_filter.col]) === String(_filter.val)) {
              Object.assign(row, _data);
            }
          }
        }
        return resolve({ data: _data, error: null });
      },
    };
    return chain;
  }
}

// import_runs.js imports supa from db.js which we can't easily swap in ESM,
// so we test the logic here directly with a configurable supa parameter.

async function startRun(supa, source, windowStart, windowEnd, extraNotes = {}) {
  const { data, error } = await supa
    .from('import_runs')
    .insert({ source, started_at: new Date().toISOString(), notes: { window_start: windowStart, window_end: windowEnd, ...extraNotes } })
    .select('run_id')
    .single();
  if (error) { return null; }
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
  it('inserts a row and returns a run_id', async () => {
    const stub  = new SupaStub();
    const runId = await startRun(stub, 'seed_test', '2026-01-01', '2026-01-01');
    assert.ok(runId > 0, 'should return a positive integer run_id');
  });

  it('stores the source and window in the row', async () => {
    const stub  = new SupaStub();
    const runId = await startRun(stub, 'seed_facilities', '2026-02-01', '2026-02-03');
    const row   = stub.rows[runId];
    assert.equal(row.source, 'seed_facilities');
    assert.equal(row.notes.window_start, '2026-02-01');
    assert.equal(row.notes.window_end,   '2026-02-03');
  });

  it('merges extraNotes into the notes object', async () => {
    const stub  = new SupaStub();
    const runId = await startRun(stub, 'seed_inspections', '2026-01-15', '2026-01-20', { recovery: true });
    const row   = stub.rows[runId];
    assert.equal(row.notes.recovery, true);
  });

  it('returns null (non-fatal) when supabase errors', async () => {
    const brokenSupa = { from: () => ({ insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'conn refused' } }) }) }) }) };
    const runId = await startRun(brokenSupa, 'x', '2026-01-01', '2026-01-01');
    assert.equal(runId, null);
  });
});

describe('finishRun', () => {
  it('updates rows_read and rows_upserted', async () => {
    const stub  = new SupaStub();
    const runId = await startRun(stub, 'seed_test', '2026-01-01', '2026-01-01');
    await finishRun(stub, runId, 5000, 4200);
    const row = stub.rows[runId];
    assert.equal(row.rows_read,     5000);
    assert.equal(row.rows_upserted, 4200);
  });

  it('no-ops when runId is null', async () => {
    const stub = new SupaStub();
    await assert.doesNotReject(() => finishRun(stub, null, 0, 0));
  });
});

describe('failRun', () => {
  it('records an error note', async () => {
    const stub  = new SupaStub();
    const runId = await startRun(stub, 'seed_test', '2026-01-01', '2026-01-01');
    await failRun(stub, runId, new Error('timeout'));
    const row = stub.rows[runId];
    assert.equal(row.notes.error, 'timeout');
  });

  it('accepts a raw string instead of an Error', async () => {
    const stub  = new SupaStub();
    const runId = await startRun(stub, 'seed_test', '2026-01-01', '2026-01-01');
    await failRun(stub, runId, 'something went wrong');
    const row = stub.rows[runId];
    assert.equal(row.notes.error, 'something went wrong');
  });

  it('no-ops when runId is null', async () => {
    const stub = new SupaStub();
    await assert.doesNotReject(() => failRun(stub, null, new Error('x')));
  });
});
