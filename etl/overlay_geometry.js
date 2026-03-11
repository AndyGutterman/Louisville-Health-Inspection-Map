/**
 * overlay_geometry.js
 * Refreshes name, address, and coordinates for all facilities from FoodServiceData.
 * FoodMapping blocks all requests (499 Token Required) — do not use it.
 * Runs twice in ingest.yml to catch stubs created by seed_inspections.
 */
import { supa }           from './lib/db.js';
import { paginateArcGIS } from './lib/arcgis.js';

const normId = v => {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/,/g, '').trim(), 10);
  return Number.isFinite(n) ? String(n) : null;
};

const FS_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';
const BATCH   = 500;

(async function run() {
  // Deduplicate by eid — FoodServiceData has duplicate EstablishmentID rows
  const byEid = new Map();

  console.log('Scanning FoodServiceData…');
  for await (const { attrs, page, offset } of paginateArcGIS(FS_BASE, {
    where:          '1=1',
    outFields:      'EstablishmentID,EstablishmentName,Address,City,State,Zip',
    orderByFields:  'EstablishmentID ASC',
    returnGeometry: 'true',
    outSR:          '4326',
  }, { pageSize: 1000, delayMs: 50 })) {
    for (const a of attrs) {
      const eid = normId(a.EstablishmentID);
      if (!eid) continue;
      const row = {
        establishment_id: eid,
        permit_number:    eid,
        name:             a.EstablishmentName || null,
        address:          a.Address           || null,
        city:             a.City              || null,
        state:            a.State             || null,
        zip:              a.Zip != null ? String(a.Zip) : null,
        loc_source:       'legacy',
      };
      // _lon/_lat attached by fetchArcGISPage when returnGeometry=true
      if (a._lon != null && a._lat != null) {
        row.lon  = a._lon;
        row.lat  = a._lat;
        row.geom = `SRID=4326;POINT(${a._lon} ${a._lat})`;
      }
      byEid.set(eid, row);
    }
    console.log(`  page ${page} @${offset}: ${attrs.length} records (${byEid.size} unique)`);
  }

  console.log(`\nUpserting ${byEid.size} facilities…`);
  const rows = [...byEid.values()];
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supa
      .from('facilities')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'establishment_id' });
    if (error) throw error;
    total += Math.min(BATCH, rows.length - i);
  }

  console.log(`overlay_geometry complete — ${total} facilities updated.`);
})().catch(err => { console.error('overlay_geometry failed:', err); process.exit(1); });