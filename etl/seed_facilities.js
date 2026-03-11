import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa   = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const FS_BASE = `https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0`;

const normId = v => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n) : null;
};
const normText = s =>
  s
    ? String(s)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async function run() {
  try {
    // fetch existing IDs so we only insert new ones
    const { data: existingRows } = await supa
      .from('facilities')
      .select('establishment_id');
    const existing = new Set(existingRows.map(r => r.establishment_id));

    // page through FS — now with geometry so we get lon/lat for new facilities
    const pageSize = 1000;
    let offset = 0;
    let pageCount = 0;
    let totalNew = 0;

    while (true) {
      pageCount++;
      const params = new URLSearchParams({
        where:             '1=1',
        outFields:         'EstablishmentID,EstablishmentName,Address,City,State,Zip,NameSearch,EstType,Subtype',
        orderByFields:     'EstablishmentID ASC',
        resultRecordCount: String(pageSize),
        resultOffset:      String(offset),
        returnGeometry:    'true',   // ← was 'false'; now captures point coordinates
        outSR:             '4326',   // WGS84 lon/lat
        f:                 'json',
      });

      const js    = await fetch(`${FS_BASE}/query?${params}`).then(r => r.json());
      const feats = js.features || [];
      if (!feats.length) break;

      const batch = [];
      for (const f of feats) {
        const a   = f.attributes;
        const eid = normId(a.EstablishmentID);
        if (!eid || existing.has(eid)) continue;
        existing.add(eid);

        // FoodServiceData geometry is a point; g.x = lon, g.y = lat
        const g   = f.geometry;
        const lon = g && typeof g.x === 'number' ? g.x : null;
        const lat = g && typeof g.y === 'number' ? g.y : null;

        const row = {
          establishment_id: eid,
          permit_number:    eid,
          name:             a.EstablishmentName || null,
          address:          a.Address           || null,
          city:             a.City              || null,
          state:            a.State             || null,
          zip:              a.Zip != null ? String(a.Zip) : null,
          name_search:      normText(a.NameSearch || a.EstablishmentName),
          addr_search:      normText(a.Address),
          loc_source:       'legacy',
          facility_type:    Number.isFinite(+a.EstType) ? +a.EstType : null,
          subtype:          Number.isFinite(+a.Subtype) ? +a.Subtype : null,
        };

        // Attach geometry if available — FoodMapping overlay will overwrite later
        // with its higher-quality coordinates, so this is just a safe fallback.
        if (lon !== null && lat !== null) {
          row.lon  = lon;
          row.lat  = lat;
          row.geom = `SRID=4326;POINT(${lon} ${lat})`;
        }

        batch.push(row);
      }

      if (batch.length) {
        const { data, error } = await supa
          .from('facilities')
          .upsert(batch, { onConflict: 'establishment_id' })
          .select('establishment_id');

        if (error) {
          console.error(`Page ${pageCount}: upsert error`, error);
        } else {
          const withGeo = batch.filter(r => r.lon != null).length;
          console.log(`Page ${pageCount}: upserted ${data.length} new facilities (${withGeo} with geometry)`);
          totalNew += data.length;
        }
      } else {
        console.log(`Page ${pageCount}: no new facilities`);
      }

      offset += pageSize;
      await sleep(50);
    }

    console.log(`seed_facilities complete — ${totalNew} rows added.`);
  } catch (err) {
    console.error('seed_facilities.js failed:', err);
    process.exit(1);
  }
})();