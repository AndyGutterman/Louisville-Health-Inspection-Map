import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const FM_BASE = `https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodMapping/FeatureServer/0`;
const chunkSize = 300;
const sleep     = ms => new Promise(r=>setTimeout(r,ms));
const normId    = v => {
  if (v==null) return null;
  const s = String(v).replace(/,/g,'').trim(), n=parseInt(s,10);
  return Number.isFinite(n)?String(n):null;
};

async function getIds() {
  const j = await fetch(`${FM_BASE}/query?where=1=1&returnIdsOnly=true&f=json`).then(r=>r.json());
  return Array.isArray(j.objectIds) ? j.objectIds : [];
}

async function fetchChunk(ids) {
  const url = [
    `${FM_BASE}/query?objectIds=${ids.join(',')}`,
    `&outFields=permit_number,premise_name,premise_address`,
    `&returnGeometry=true&outSR=4326&f=json`
  ].join('');
  return fetch(url).then(r=>r.json());
}

(async function run() {
  const ids = await getIds();
  let total=0, page=0;

  for (let i=0; i<ids.length; i+=chunkSize) {
    const js = await fetchChunk(ids.slice(i,i+chunkSize));
    const up = (js.features||[]).map(f=>{
      const a=f.attributes, g=f.geometry;
      const eid = normId(a.permit_number);
      if (!eid || typeof g.x!=='number' || typeof g.y!=='number') return null;
      return {
        establishment_id: eid,
        permit_number:    eid,
        name:             a.premise_name   || null,
        address:          a.premise_address|| null,
        loc_source:       'foodmapping',
        geom:             `SRID=4326;POINT(${g.x} ${g.y})`
      };
    }).filter(x=>x);

    if (up.length) {
      const { error } = await supa
        .from('facilities')
        .upsert(up, { onConflict:'establishment_id' });
      if (error) throw error;
      total += up.length;
    }

    console.log(`FM page ${++page}: ${up.length} overlayed`);
    await sleep(50);
  }

  console.log('FM geometry overlayed:', total);
})().catch(console.error);
