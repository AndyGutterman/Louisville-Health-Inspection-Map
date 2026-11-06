/**
 * lib/import_runs.js — audit-log helpers for the import_runs table.
 *
 * Each seed script calls:
 *   const runId = await startRun(source, since, until, { ...extraNotes });
 *   await finishRun(runId, rowsRead, rowsUpserted);
 *   // or on failure:
 *   await failRun(runId, err);
 */
import { supa } from './db.js';

export async function startRun(source, windowStart, windowEnd, extraNotes = {}) {
  const { data, error } = await supa
    .from('import_runs')
    .insert({
      source,
      started_at: new Date().toISOString(),
      notes: { window_start: windowStart, window_end: windowEnd, ...extraNotes },
    })
    .select('run_id')
    .single();

  if (error) { console.warn('import_runs insert failed (non-fatal):', error.message); return null; }
  return data.run_id;
}

export async function finishRun(runId, rowsRead, rowsUpserted) {
  if (!runId) return;
  const { error } = await supa
    .from('import_runs')
    .update({ finished_at: new Date().toISOString(), rows_read: rowsRead, rows_upserted: rowsUpserted })
    .eq('run_id', runId);
  if (error) console.warn('import_runs finish failed (non-fatal):', error.message);
}

export async function failRun(runId, err) {
  if (!runId) return;
  const { error } = await supa
    .from('import_runs')
    .update({
      finished_at: new Date().toISOString(),
      notes: { error: String(err?.message || err) },
    })
    .eq('run_id', runId);
  if (error) console.warn('import_runs fail update failed (non-fatal):', error.message);
}
