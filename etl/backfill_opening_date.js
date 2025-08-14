import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// FoodMapping feature layer (same base you used for geometry overlay)
const FM_BASE = `https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodMapping/FeatureServer/0`;

const CHUNK = 300;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const normId = (v) => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n) : null;
};
const toISO = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

async function getIds() {
  const j = await fetch(`${FM_BASE}/query?where=1=1&returnIdsOnly=true&f=json`).then(r => r.json());
  return Array.isArray(j.objectIds) ? j.objectIds : [];
}

async function fetchChunk(ids) {
  const fields = ['permit_number','opening_date'].join(',');
  const url = `${FM_BASE}/query?objectIds=${ids.join(',')}&outFields=${fields}&returnGeometry=false&f=json`;
  const j = await fetch(url).then(r => r.json());
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.features || [];
}

(async function run() {
  const ids = await getIds();
  let total = 0, page = 0;

  for (let i = 0; i < ids.length; i += CHUNK) {
    const feats = await fetchChunk(ids.slice(i, i + CHUNK));

    const updates = [];
    for (const f of feats) {
      const a = f.attributes || {};
      const eid = normId(a.permit_number);
      if (!eid) continue;
      const ms = a.opening_date;
      const opening_date = toISO(ms);
      if (!opening_date) continue;

      updates.push({ establishment_id: eid, opening_date });
    }

    if (updates.length) {
      const { error, data } = await supa
        .from('facilities')
        .upsert(updates, { onConflict: 'establishment_id' })
        .select('establishment_id');

      if (error) throw error;
      total += (data?.length ?? 0);
      console.log(`page ${++page}: wrote ${data?.length ?? 0} rows`);
    } else {
      console.log(`page ${++page}: nothing to write`);
    }

    await sleep(40);
  }

  console.log(`done. opening_date updated for ~${total} facilities`);
})().catch(err => {
  console.error('backfill_opening_date failed:', err);
  process.exit(1);
});

