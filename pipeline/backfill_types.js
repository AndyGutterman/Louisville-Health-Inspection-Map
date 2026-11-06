/**
 * backfill_types.js
 *
 * Fills facility_type and subtype for facilities that are missing them.
 * Source: Louisville_Metro_KY_Permitted_Food_Service_Establishments
 *   — the only ArcGIS endpoint that has facility_type + subtype keyed by permit_number.
 *   — FoodServiceData does NOT have these fields; do not attempt to fetch them from there.
 * Run order in ingest.yml:
 *   seed_facilities → seed_inspections → overlay_geometry → backfill_types → geocode_missing
 *
 * Safe to re-run: only touches rows where facility_type IS NULL.
 */
import 'dotenv/config';
import { supa }           from './lib/db.js';
import { paginateArcGIS } from './lib/arcgis.js';

const EST_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Permitted_Food_Service_Establishments/FeatureServer/0';

const normId = v => {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/,/g, '').trim(), 10);
  return Number.isFinite(n) ? String(n) : null;
};

async function getNullIds() {
  const ids = new Set();
  let offset = 0;
  const PAGE = 1000;
  for (;;) {
    const { data, error } = await supa
      .from('facilities')
      .select('establishment_id')
      .is('facility_type', null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) ids.add(r.establishment_id);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return ids;
}

(async function run() {
  const needsFix = await getNullIds();
  console.log(`Facilities needing type/subtype backfill: ${needsFix.size}`);
  if (!needsFix.size) { console.log('Nothing to do.'); return; }

  let totalFixed = 0;

  for await (const { attrs, page, offset } of paginateArcGIS(EST_BASE, {
    where:     '1=1',
    outFields: 'permit_number,facility_type,subtype',
  }, { pageSize: 1000, delayMs: 50 })) {
    const updates = attrs
      .map(a => ({
        establishment_id: normId(a.permit_number),
        facility_type:    Number.isFinite(+a.facility_type) ? +a.facility_type : null,
        subtype:          Number.isFinite(+a.subtype)       ? +a.subtype       : null,
      }))
      .filter(r => r.establishment_id
               && needsFix.has(r.establishment_id)
               && r.facility_type != null
               && r.subtype != null);

    if (updates.length) {
      const { error } = await supa
        .from('facilities')
        .upsert(updates, { onConflict: 'establishment_id' });
      if (error) throw error;
      totalFixed += updates.length;
      console.log(`page ${page} @${offset}: fixed ${updates.length}`);
    } else {
      console.log(`page ${page} @${offset}: nothing to fix`);
    }
  }

  const remaining = needsFix.size - totalFixed;
  console.log(`Done — backfilled type/subtype for ${totalFixed} facilities.`);
  if (remaining > 0) {
    console.log(`Note: ${remaining} facilities still have no type (not yet in Establishments endpoint — normal for new/closed permits).`);
  }
})().catch(err => { console.error('backfill_types failed:', err); process.exit(1); });