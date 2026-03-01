/**
 * seed_inspections.js
 *
 * Daily incremental sync — fetches inspections newer than what's in the DB.
 * Supports an explicit window for recovery:
 *
 *   node seed_inspections.js                         # normal incremental
 *   node seed_inspections.js --since=2026-01-15      # from a specific date
 *   node seed_inspections.js --since=2026-01-15 --until=2026-01-20
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FS   = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

// ── CLI args ──────────────────────────────────────────────────────────────────
const cliArgs   = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k,v]=a.slice(2).split('='); return [k, v ?? true]; })
);
const FORCED_SINCE = cliArgs.since  || null;
const FORCED_UNTIL = cliArgs.until  || null;
const IS_RECOVERY  = !!FORCED_SINCE;

// ── helpers ───────────────────────────────────────────────────────────────────
const normId    = v => { if (v==null) return null; const s=String(v).replace(/,/g,'').trim(),n=parseInt(s,10); return Number.isFinite(n)?String(n):null; };
const toISODate = ms => ms ? new Date(ms).toISOString().slice(0,10) : null;
const sleep     = ms => new Promise(r => setTimeout(r, ms));

// ── import_runs ───────────────────────────────────────────────────────────────
async function startRun(windowStart, windowEnd) {
  const { data, error } = await supa
    .from('import_runs')
    .insert({
      source:     'seed_inspections',
      started_at: new Date().toISOString(),
      notes:      { window_start: windowStart, window_end: windowEnd, recovery: IS_RECOVERY },
    })
    .select('run_id')
    .single();
  if (error) { console.warn('import_runs insert failed (non-fatal):', error.message); return null; }
  return data.run_id;
}

async function finishRun(runId, rowsRead, rowsUpserted) {
  if (!runId) return;
  await supa.from('import_runs').update({
    finished_at: new Date().toISOString(),
    rows_read:     rowsRead,
    rows_upserted: rowsUpserted,
  }).eq('run_id', runId);
}

async function failRun(runId, err) {
  if (!runId) return;
  await supa.from('import_runs').update({
    finished_at: new Date().toISOString(),
    notes:       { error: String(err?.message || err) },
  }).eq('run_id', runId);
}

// ── ArcGIS fetch ──────────────────────────────────────────────────────────────
async function fetchPage(offset, since, until, attempt = 1) {
  const whereParts = [`InspectionDate >= DATE '${since}'`];
  if (until) whereParts.push(`InspectionDate <= DATE '${until}'`);

  const p = new URLSearchParams({
    where:             whereParts.join(' AND '),
    outFields:         'EstablishmentID,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
    orderByFields:     'InspectionDate ASC, InspectionID ASC',
    resultRecordCount: '2000',
    resultOffset:      String(offset),
    returnGeometry:    'false',
    f:                 'json',
  });

  const res  = await fetch(`${FS}/query?${p}`);
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (j.error) throw new Error(JSON.stringify(j.error));
    return (j.features || []).map(f => f.attributes);
  } catch (err) {
    if (attempt < 4) {
      console.warn(`  ArcGIS bad response @${offset}, retry ${attempt}...`);
      await sleep(1500 * attempt);
      return fetchPage(offset, since, until, attempt + 1);
    }
    throw err;
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
(async function run() {

  // Determine window
  let since, until;

  if (FORCED_SINCE) {
    // Recovery / manual mode — explicit window passed in
    since = FORCED_SINCE;
    until = FORCED_UNTIL || new Date().toISOString().slice(0, 10);
    console.log(`Mode: RECOVERY  window: ${since} → ${until}`);
  } else {
    // Normal incremental — fetch everything newer than DB max
    const { data: maxRow, error: e1 } = await supa
      .from('inspections')
      .select('inspection_date')
      .order('inspection_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw e1;

    // Go back 2 days from DB max to catch any late-arriving records
    const dbMax = maxRow?.inspection_date || '1900-01-01';
    const d     = new Date(dbMax);
    d.setDate(d.getDate() - 2);
    since = d.toISOString().slice(0, 10);
    until = new Date().toISOString().slice(0, 10);
    console.log(`Mode: INCREMENTAL  DB max: ${dbMax}  fetching from: ${since}`);
  }

  const runId = await startRun(since, until);

  try {
    // Pre-load facility IDs
    const { data: facRows, error: e2 } = await supa.from('facilities').select('establishment_id');
    if (e2) throw e2;
    const haveFacility = new Set((facRows || []).map(r => r.establishment_id));

    let offset      = 0;
    let page        = 0;
    let totalRead   = 0;
    let totalNew    = 0;

    for (;;) {
      const attrs = await fetchPage(offset, since, until);
      if (!attrs.length) break;

      totalRead += attrs.length;

      const rows = attrs.map(a => {
        const eid = normId(a.EstablishmentID);
        if (!eid) return null;
        return {
          inspection_id:    a.InspectionID,
          establishment_id: eid,
          ins_type_desc:    a.Ins_TypeDesc || null,
          inspection_date:  toISODate(a.InspectionDate),
          score:            a.score ?? null,
          grade:            a.Grade || null,
          raw:              a,
        };
      }).filter(Boolean);

      // Ensure facilities exist (FK guard)
      const missingEids = [...new Set(rows.map(r => r.establishment_id))]
        .filter(eid => !haveFacility.has(eid));

      if (missingEids.length) {
        const { error: fke } = await supa
          .from('facilities')
          .upsert(
            missingEids.map(eid => ({ establishment_id: eid, permit_number: eid, loc_source: 'legacy' })),
            { onConflict: 'establishment_id' }
          );
        if (fke) throw fke;
        missingEids.forEach(eid => haveFacility.add(eid));
      }

      const { error } = await supa
        .from('inspections')
        .upsert(rows, { onConflict: 'inspection_id' });
      if (error) throw error;

      totalNew  += rows.length;
      const lastDate = rows[rows.length - 1]?.inspection_date;
      console.log(`Page ${++page} @${offset}: ${rows.length} rows  latest: ${lastDate}`);

      if (attrs.length < 2000) break;
      offset += 2000;
      await sleep(80);
    }

    console.log(`seed_inspections complete — ${totalNew} rows upserted  (window: ${since} → ${until})`);
    await finishRun(runId, totalRead, totalNew);

  } catch (err) {
    console.error('seed_inspections failed:', err);
    await failRun(runId, err);
    process.exit(1);
  }
})();