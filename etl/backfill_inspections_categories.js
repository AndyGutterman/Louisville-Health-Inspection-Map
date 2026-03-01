/**
 * Usage:
 *   node full_backfill.js
 *   node full_backfill.js --skip-categories
 *   node full_backfill.js --skip-inspections
 */

import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FS = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';
const CATEGORIES_URL = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Permitted_Food_Service_Types_with_Subtypes/FeatureServer/0/query';

const args        = new Set(process.argv.slice(2));
const DO_CATS     = !args.has('--skip-categories');
const DO_INSP     = !args.has('--skip-inspections');
const PAGE_SIZE   = 2000;

const normId    = v => { if (v==null) return null; const s=String(v).replace(/,/g,'').trim(),n=parseInt(s,10); return Number.isFinite(n)?String(n):null; };
const toISODate = ms => ms ? new Date(ms).toISOString().slice(0,10) : null;
const sleep     = ms => new Promise(r => setTimeout(r, ms));


async function fetchInspPage(offset, attempt = 1) {
  const p = new URLSearchParams({
    where:             '1=1',
    outFields:         'EstablishmentID,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
    orderByFields:     'InspectionDate ASC, InspectionID ASC',
    resultRecordCount: String(PAGE_SIZE),
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
      return fetchInspPage(offset, attempt + 1);
    }
    throw err;
  }
}

// ── Step 1: facility_categories ───────────────────────────────────────────────

async function backfillCategories() {
  console.log('\n══ [1/2] facility_categories ══');
  const params = new URLSearchParams({
    where:          '1=1',
    outFields:      'facility_type,facility_type_description,subtype,subtype_description',
    returnGeometry: 'false',
    f:              'json',
  });

  const res  = await fetch(`${CATEGORIES_URL}?${params}`);
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));

  const records = (json.features || []).map(f => ({
    facility_type:             f.attributes.facility_type,
    facility_type_description: f.attributes.facility_type_description,
    subtype:                   f.attributes.subtype,
    subtype_description:       f.attributes.subtype_description,
  }));

  console.log(`  Fetched ${records.length} category rows from ArcGIS`);

  const { error } = await supa
    .from('facility_categories')
    .upsert(records, { onConflict: 'facility_type,subtype' });
  if (error) throw error;

  console.log(`  ✓ Upserted ${records.length} categories`);
}

// ── Step 2: inspections ───────────────────────────────────────────────────────

async function backfillInspections() {
  console.log('\n══ [2/2] inspections (full history) ══');

  // Pre-load all known facility IDs so we can auto-create placeholders for unknowns
  const { data: facRows, error: facErr } = await supa
    .from('facilities')
    .select('establishment_id');
  if (facErr) throw facErr;
  const haveFacility = new Set((facRows || []).map(r => r.establishment_id));
  console.log(`  Loaded ${haveFacility.size} known facility IDs`);

  // Get current inspection count so we can show progress
  const { count: existingCount } = await supa
    .from('inspections')
    .select('*', { head: true, count: 'exact' });
  console.log(`  Current inspections in DB: ${existingCount ?? '?'}`);

  let offset     = 0;
  let page       = 0;
  let totalRows  = 0;

  for (;;) {
    const attrs = await fetchInspPage(offset);
    if (!attrs.length) break;

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

    // Auto-create facility placeholders for any unknown establishment IDs
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

    totalRows += rows.length;
    const firstDate = rows[0]?.inspection_date;
    const lastDate  = rows[rows.length - 1]?.inspection_date;
    console.log(`  Page ${++page} @${offset}: ${rows.length} rows  [${firstDate} → ${lastDate}]  total so far: ${totalRows}`);

    if (attrs.length < PAGE_SIZE) break; // last page
    offset += PAGE_SIZE;
    await sleep(80);
  }

  console.log(`  ✓ Backfill complete — ${totalRows} inspection rows upserted`);
  return totalRows;
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async function run() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║         full_backfill.js             ║');
  console.log('╚══════════════════════════════════════╝');
  const t0 = Date.now();

  if (DO_CATS)  await backfillCategories();
  if (DO_INSP)  await backfillInspections();

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✓ Done in ${secs}s`);
})().catch(err => {
  console.error('\n✗ full_backfill failed:', err);
  process.exit(1);
});
