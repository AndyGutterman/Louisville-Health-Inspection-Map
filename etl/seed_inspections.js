import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const FS   = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

const normId = v => {
  if (v==null) return null;
  const s = String(v).replace(/,/g,'').trim();
  const n = parseInt(s,10);
  return Number.isFinite(n) ? String(n) : null;
};

async function fetchPage(offset, size=1000) {
  const p = new URLSearchParams({
    where:             '1=1',
    outFields:         'EstablishmentID,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
    orderByFields:     'InspectionDate DESC',
    resultRecordCount: String(size),
    resultOffset:      String(offset),
    returnGeometry:    'false',
    f:                 'json'
  });
  const j = await fetch(`${FS}/query?${p}`).then(r=>r.json());
  return j.features || [];
}

(async function run() {
  let offset=0, total=0;
  while (true) {
    const feats = await fetchPage(offset);
    if (!feats.length) break;

    const rows = feats.map(f=>{
      const a = f.attributes, eid = normId(a.EstablishmentID);
      if (!eid) return null;
      return {
        inspection_id:    a.InspectionID,
        establishment_id: eid,
        ins_type_desc:    a.Ins_TypeDesc||null,
        inspection_date:  a.InspectionDate
                          ? new Date(a.InspectionDate).toISOString().slice(0,10)
                          : null,
        score:            a.score  ?? null,
        grade:            a.Grade  || null,
        raw:              a
      };
    }).filter(x=>x);

    const { error } = await supa
      .from('inspections')
      .upsert(rows, { onConflict:'inspection_id' });
    if (error) throw error;

    console.log(`Inspections page @${offset}: ${rows.length} upserted`);
    total += rows.length;
    offset += 1000;
  }
  console.log('Inspection rows upserted:', total);
})();
