import { supa }           from './lib/db.js';
import { normText }       from './lib/utils.js';
import { paginateArcGIS } from './lib/arcgis.js';

// Note: FoodServiceData does NOT have EstType or Subtype fields.
// facility_type and subtype are backfilled separately by backfill_types.js
// which queries Louisville_Metro_KY_Permitted_Food_Service_Establishments.

const normId = v => {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/,/g, '').trim(), 10);
  return Number.isFinite(n) ? String(n) : null;
};

const FS_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

(async function run() {
  const { data: existingRows, error: loadErr } = await supa.from('facilities').select('establishment_id');
  if (loadErr) throw loadErr;
  const existing = new Set(existingRows.map(r => r.establishment_id));
  console.log(`Existing facilities: ${existing.size}`);

  let totalNew = 0;

  for await (const { attrs, page, offset } of paginateArcGIS(FS_BASE, {
    where:         '1=1',
    outFields:     'EstablishmentID,EstablishmentName,Address,City,State,Zip',
    orderByFields: 'EstablishmentID ASC',
  }, { pageSize: 1000, delayMs: 50 })) {
    const batch = [];
    for (const a of attrs) {
      const eid = normId(a.EstablishmentID);
      if (!eid || existing.has(eid)) continue;
      existing.add(eid);
      batch.push({
        establishment_id: eid,
        permit_number:    eid,
        name:             a.EstablishmentName || null,
        address:          a.Address           || null,
        city:             a.City              || null,
        state:            a.State             || null,
        zip:              a.Zip != null ? String(a.Zip) : null,
        name_search:      normText(a.EstablishmentName),
        addr_search:      normText(a.Address),
        loc_source:       'legacy',
        // facility_type + subtype filled by backfill_types.js (runs after overlay_geometry)
        // lon/lat/geom filled by overlay_geometry.js
      });
    }

    if (batch.length) {
      const { data, error } = await supa
        .from('facilities')
        .upsert(batch, { onConflict: 'establishment_id' })
        .select('establishment_id');
      if (error) throw error;
      totalNew += data.length;
      console.log(`page ${page} @${offset}: ${data.length} new`);
    } else {
      console.log(`page ${page} @${offset}: no new facilities`);
    }
  }

  console.log(`seed_facilities complete — ${totalNew} new facilities added.`);
})().catch(err => { console.error('seed_facilities failed:', err); process.exit(1); });