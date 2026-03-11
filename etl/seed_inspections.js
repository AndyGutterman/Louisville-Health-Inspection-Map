/**
 * seed_inspections.js — daily incremental sync.
 *
 *   node seed_inspections.js                          # normal incremental
 *   node seed_inspections.js --since=2026-01-15       # from a specific date
 *   node seed_inspections.js --since=2026-01-15 --until=2026-01-20
 */
import { supa }                        from './lib/db.js';
import { startRun, finishRun, failRun } from './lib/import_runs.js';
import { normId, toISODate }            from './lib/utils.js';
import { paginateArcGIS }               from './lib/arcgis.js';

const FS_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

// ── CLI args ──────────────────────────────────────────────────────────────────
const cliArgs = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; })
);
const FORCED_SINCE = cliArgs.since || null;
const FORCED_UNTIL = cliArgs.until || null;
const IS_RECOVERY  = !!FORCED_SINCE;

(async function run() {
  let since, until;

  if (FORCED_SINCE) {
    since = FORCED_SINCE;
    until = FORCED_UNTIL || new Date().toISOString().slice(0, 10);
    console.log(`Mode: RECOVERY  window: ${since} → ${until}`);
  } else {
    const { data: maxRow, error } = await supa
      .from('inspections')
      .select('inspection_date')
      .order('inspection_date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const dbMax = maxRow?.inspection_date || '1900-01-01';
    const d = new Date(dbMax);
    d.setDate(d.getDate() - 2);
    since = d.toISOString().slice(0, 10);
    until = new Date().toISOString().slice(0, 10);
    console.log(`Mode: INCREMENTAL  DB max: ${dbMax}  fetching from: ${since}`);
  }

  const runId = await startRun('seed_inspections', since, until, { recovery: IS_RECOVERY });

  try {
    // Pre-load facility IDs for FK guard
    const { data: facRows, error: e2 } = await supa.from('facilities').select('establishment_id');
    if (e2) throw e2;
    const haveFacility = new Set((facRows || []).map(r => r.establishment_id));

    let totalRead = 0, totalNew = 0, totalStubs = 0;
    const whereParts = [`InspectionDate >= DATE '${since}'`];
    if (until) whereParts.push(`InspectionDate <= DATE '${until}'`);

    for await (const { attrs, page } of paginateArcGIS(FS_BASE, {
      where:         whereParts.join(' AND '),
      // Include EstablishmentName and Address so stubs are never nameless
      outFields:     'EstablishmentID,EstablishmentName,Address,City,State,Zip,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
      orderByFields: 'InspectionDate ASC, InspectionID ASC',
    })) {
      totalRead += attrs.length;

      const rows = attrs.flatMap(a => {
        const eid = normId(a.EstablishmentID);
        if (!eid) return [];
        return [{ inspection_id: a.InspectionID, establishment_id: eid,
                  ins_type_desc: a.Ins_TypeDesc || null, inspection_date: toISODate(a.InspectionDate),
                  score: a.score ?? null, grade: a.Grade || null, raw: a }];
      });

      // Build a lookup of eid → name/address from this page's data
      const metaByEid = new Map();
      for (const a of attrs) {
        const eid = normId(a.EstablishmentID);
        if (eid && !metaByEid.has(eid)) {
          metaByEid.set(eid, {
            name:    a.EstablishmentName || null,
            address: a.Address           || null,
            city:    a.City              || null,
            state:   a.State             || null,
            zip:     a.Zip != null ? String(a.Zip) : null,
          });
        }
      }

      // Stub-insert any facilities missing from the FK set — now WITH name/address
      const missingEids = [...new Set(rows.map(r => r.establishment_id))].filter(eid => !haveFacility.has(eid));
      if (missingEids.length) {
        const placeholders = missingEids.map(eid => ({
          establishment_id: eid,
          permit_number: eid,
          loc_source: 'FoodServiceData'
        }));
        const { error: fke } = await supa
          .from('facilities')
          .upsert(
            missingEids.map(eid => ({ establishment_id: eid, permit_number: eid, loc_source: 'legacy' })),
            { onConflict: 'establishment_id' }
          )
        if (fke) throw fke;
        missingEids.forEach(eid => haveFacility.add(eid));
        totalStubs += missingEids.length;
        console.log(`  → stubbed ${missingEids.length} new facilities with name/address`);
      }

      const { error } = await supa.from('inspections').upsert(rows, { onConflict: 'inspection_id' });
      if (error) throw error;

      totalNew += rows.length;
      console.log(`Page ${page}: ${rows.length} rows  latest: ${rows.at(-1)?.inspection_date}`);
    }

    console.log(`seed_inspections complete — ${totalNew} rows upserted, ${totalStubs} new facility stubs  (window: ${since} → ${until})`);
    await finishRun(runId, totalRead, totalNew);

  } catch (err) {
    console.error('seed_inspections failed:', err);
    await failRun(runId, err);
    process.exit(1);
  }
})();