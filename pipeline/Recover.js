/**
 * recover.js
 *
 * Runs FIRST in the GitHub Actions workflow.
 * Checks import_runs for any runs that either:
 *   (a) finished_at IS NULL — script crashed or was killed mid-run
 *   (b) notes->>'error' is set — script caught an error and logged it
 *
 * For each failed run it replays the exact date window that failed
 * by spawning the relevant script with --since / --until flags.
 *
 * A run that is marked as recovered is updated with notes->>'recovered_by'
 * pointing to the new run_id so you have a full audit trail.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { execSync }     from 'child_process';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// How far back to look for failed runs (safety net — avoids replaying ancient history)
const MAX_LOOKBACK_DAYS = 30;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// Scripts we know how to recover (must accept --since / --until)
const RECOVERABLE = new Set(['seed_facilities', 'seed_inspections']);

async function findFailedRuns() {
  const cutoff = daysAgo(MAX_LOOKBACK_DAYS);

  const { data, error } = await supa
    .from('import_runs')
    .select('run_id, source, started_at, finished_at, notes')
    .in('source', [...RECOVERABLE])
    .gte('started_at', cutoff)
    .order('started_at', { ascending: true });

  if (error) throw error;

  return (data || []).filter(r => {
    // Stuck: started but never finished
    if (!r.finished_at) return true;
    // Errored: finished but with an error note
    if (r.notes?.error)  return true;
    // Already recovered: skip
    if (r.notes?.recovered_at) return false;
    return false;
  });
}

async function markRecovered(runId, recoveredByRunId) {
  const { data: existing } = await supa
    .from('import_runs')
    .select('notes')
    .eq('run_id', runId)
    .single();

  const notes = { ...(existing?.notes || {}), recovered_at: new Date().toISOString(), recovered_by_run: recoveredByRunId };

  await supa
    .from('import_runs')
    .update({ notes })
    .eq('run_id', runId);
}

async function replayRun(failedRun) {
  const { run_id, source, notes, started_at } = failedRun;

  // Determine the window to replay
  // Prefer the window stored in notes; fall back to the run's date += 1 day buffer
  const runDate = (started_at || '').slice(0, 10);
  const since   = notes?.window_start || runDate;
  const until   = notes?.window_end   || runDate;

  // A 1 day buffer on each side to be safe
  const sinceD = new Date(since); sinceD.setDate(sinceD.getDate() - 1);
  const untilD = new Date(until); untilD.setDate(untilD.getDate() + 1);
  const sinceStr = sinceD.toISOString().slice(0, 10);
  const untilStr = untilD.toISOString().slice(0, 10);

  console.log(`\n  Replaying ${source}  window: ${sinceStr} → ${untilStr}  (original run_id: ${run_id})`);

  const scriptMap = {
    seed_facilities:  'seed_facilities.js',
    seed_inspections: 'seed_inspections.js',
  };

  const script = scriptMap[source];
  if (!script) {
    console.warn(`  No recovery script mapped for "${source}", skipping`);
    return null;
  }

  try {
    execSync(
      `node ${script} --since=${sinceStr} --until=${untilStr}`,
      { stdio: 'inherit' }
    );
    console.log(`  ✓ Recovery run for ${source} succeeded`);

    // Find the new run_id that was just written by the child script
    const { data: newRun } = await supa
      .from('import_runs')
      .select('run_id')
      .eq('source', source)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    await markRecovered(run_id, newRun?.run_id ?? null);
    return newRun?.run_id ?? null;

  } catch (err) {
    console.error(`  ✗ Recovery run for ${source} failed:`, err.message);
    return null;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
(async function run() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║           recover.js                 ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`Looking back ${MAX_LOOKBACK_DAYS} days for failed/stuck runs...\n`);

  const failed = await findFailedRuns();

  if (!failed.length) {
    console.log('✓ No failed runs found — nothing to recover.');
    process.exit(0);
  }

  console.log(`Found ${failed.length} run(s) to recover:`);
  for (const r of failed) {
    const reason = !r.finished_at ? 'never finished (crashed)' : `error: ${r.notes?.error}`;
    console.log(`  run_id=${r.run_id}  source=${r.source}  date=${r.started_at?.slice(0,10)}  reason: ${reason}`);
  }

  // Deduplicate: if the same source failed multiple times in the same window,
  // merge into one replay with the widest window
  const merged = new Map();
  for (const r of failed) {
    const key   = r.source;
    const since = r.notes?.window_start || r.started_at?.slice(0, 10) || '1900-01-01';
    const until = r.notes?.window_end   || r.started_at?.slice(0, 10) || '9999-12-31';

    if (!merged.has(key)) {
      merged.set(key, { ...r, notes: { ...r.notes, window_start: since, window_end: until }, all_run_ids: [r.run_id] });
    } else {
      const m = merged.get(key);
      if (since < m.notes.window_start) m.notes.window_start = since;
      if (until > m.notes.window_end)   m.notes.window_end   = until;
      m.all_run_ids.push(r.run_id);
    }
  }

  for (const [, mergedRun] of merged) {
    await replayRun(mergedRun);
    // Mark ALL original failed runs as recovered
    for (const origId of mergedRun.all_run_ids) {
      if (origId !== mergedRun.run_id) await markRecovered(origId, null);
    }
    await sleep(500);
  }

  console.log('\n✓ Recovery pass complete.');
})().catch(err => {
  console.error('recover.js failed:', err);
  // Do NOT exit(1) — a recovery failure should not block the normal daily run
  process.exit(0);
});