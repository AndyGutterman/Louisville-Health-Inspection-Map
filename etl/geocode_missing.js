/**
 * geocode_missing.js
 *
 * Finds facilities with null lon/lat and tries to assign coordinates
 * from two sources in priority order:
 *   1. FoodMapping (authoritative, higher quality)
 *   2. FoodServiceData (fallback — covers new permits not yet in FoodMapping)
 *
 * Uses POST requests to avoid URL length limits when querying many IDs.
 */
import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FM_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodMapping/FeatureServer/0';
const FS_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

const CHUNK = 50;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const normId = v => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n) : null;
};

async function postQuery(baseUrl, params) {
  const body = new URLSearchParams({ f: 'json', returnGeometry: 'true', outSR: '4326', ...params });
  const res  = await fetch(`${baseUrl}/query`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 120)}`);
  }
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.features || [];
}

async function getMissingIds() {
  const { count } = await supa
    .from('facilities')
    .select('*', { head: true, count: 'exact' })
    .is('lat', null);

  const PAGE = 1000;
  const ids  = [];
  for (let off = 0; off < (count || 0); off += PAGE) {
    const { data, error } = await supa
      .from('facilities')
      .select('establishment_id')
      .is('lat', null)
      .range(off, off + PAGE - 1);
    if (error) throw error;
    for (const r of data) ids.push(r.establishment_id);
  }
  return ids;
}

async function tryFoodMapping(eids) {
  const found = new Map();
  for (let i = 0; i < eids.length; i += CHUNK) {
    const chunk = eids.slice(i, i + CHUNK);
    const where = chunk.map(id => `permit_number = '${id}'`).join(' OR ');
    try {
      const feats = await postQuery(FM_BASE, { where, outFields: 'permit_number' });
      for (const f of feats) {
        const eid = normId(f.attributes?.permit_number);
        const g   = f.geometry;
        if (eid && g && typeof g.x === 'number' && typeof g.y === 'number') {
          found.set(eid, { lon: g.x, lat: g.y, source: 'foodmapping' });
        }
      }
    } catch (e) {
      console.warn(`FoodMapping chunk error (offset ${i}):`, e.message);
    }
    await sleep(60);
  }
  return found;
}

async function tryFoodServiceData(eids) {
  const found = new Map();
  for (let i = 0; i < eids.length; i += CHUNK) {
    const chunk = eids.slice(i, i + CHUNK);
    const where = chunk.map(id => `EstablishmentID = ${id}`).join(' OR ');
    try {
      const feats = await postQuery(FS_BASE, { where, outFields: 'EstablishmentID' });
      for (const f of feats) {
        const eid = normId(f.attributes?.EstablishmentID);
        const g   = f.geometry;
        if (eid && g && typeof g.x === 'number' && typeof g.y === 'number') {
          found.set(eid, { lon: g.x, lat: g.y, source: 'foodservicedata' });
        }
      }
    } catch (e) {
      console.warn(`FoodServiceData chunk error (offset ${i}):`, e.message);
    }
    await sleep(60);
  }
  return found;
}

async function applyUpdates(resolved) {
  const BATCH = 500;
  const rows  = [...resolved.entries()].map(([eid, { lon, lat, source }]) => ({
    establishment_id: eid,
    lon,
    lat,
    geom:       `SRID=4326;POINT(${lon} ${lat})`,
    loc_source: source,
  }));

  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supa
      .from('facilities')
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'establishment_id' });
    if (error) throw error;
    total += Math.min(BATCH, rows.length - i);
    console.log(`  wrote batch ${Math.floor(i / BATCH) + 1}: ${Math.min(BATCH, rows.length - i)} rows`);
  }
  return total;
}

(async function run() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║        geocode_missing.js            ║');
  console.log('╚══════════════════════════════════════╝');

  const missingIds = await getMissingIds();
  console.log(`Facilities missing coordinates: ${missingIds.length}`);

  if (!missingIds.length) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  console.log(`\n[1/2] Trying FoodMapping (${Math.ceil(missingIds.length / CHUNK)} chunks)…`);
  const fromFM = await tryFoodMapping(missingIds);
  console.log(`  Found in FoodMapping: ${fromFM.size}`);

  const stillMissing = missingIds.filter(id => !fromFM.has(id));
  console.log(`\n[2/2] Trying FoodServiceData for remaining ${stillMissing.length}…`);
  const fromFS = stillMissing.length ? await tryFoodServiceData(stillMissing) : new Map();
  console.log(`  Found in FoodServiceData: ${fromFS.size}`);

  const resolved   = new Map([...fromFM, ...fromFS]);
  const unresolved = missingIds.length - resolved.size;

  console.log(`\nResolved: ${resolved.size}  |  Still unresolvable: ${unresolved}`);

  if (resolved.size) {
    const written = await applyUpdates(resolved);
    console.log(`✓ Updated ${written} facilities with coordinates`);
  }

  if (unresolved > 0) {
    console.log(`\n⚠  ${unresolved} facilities have no geometry in either source.`);
    console.log('   These are likely closed/invalid permits with no location data.');
  }

  console.log('\n✓ geocode_missing complete.');
})().catch(err => {
  console.error('geocode_missing failed:', err);
  process.exit(1);
});