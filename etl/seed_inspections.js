import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FS   = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

const normId = v => {
  if (v == null) return null;
  const s = String(v).replace(/,/g,'').trim();
  const n = parseInt(s,10);
  return Number.isFinite(n) ? String(n) : null;
};

const toDate = ms => ms ? new Date(ms).toISOString().slice(0,10) : null;

async function fetchPage(where, offset, size=1000) {
  const p = new URLSearchParams({
    where,
    outFields: 'EstablishmentID,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
    orderByFields: 'InspectionDate ASC',
    resultRecordCount: String(size),
    resultOffset:      String(offset),
    returnGeometry: 'false',
    f: 'json'
  });
  const j = await fetch(`${FS}/query?${p}`).then(r => r.json());
  return j.features || [];
}

(async function run() {
  // find newest inspection date 
  const { data: maxRow } = await supa
    .from('inspections')
    .select('inspection_date')
    .order('inspection_date', { ascending:false })
    .limit(1)
    .maybeSingle();

  const sinceDate = maxRow?.inspection_date || '1900-01-01';
  const sinceMs   = Date.parse(`${sinceDate}T00:00:00Z`);
  const where     = `InspectionDate > ${sinceMs}`;

  let offset = 0, totalNew = 0, page = 0;

  while (true) {
    const feats = await fetchPage(where, offset);
    if (!feats.length) break;

    const rows = feats.map(f => {
      const a = f.attributes, eid = normId(a.EstablishmentID);
      if (!eid) return null;
      return {
        inspection_id:    a.InspectionID,
        establishment_id: eid,
        ins_type_desc:    a.Ins_TypeDesc || null,
        inspection_date:  toDate(a.InspectionDate),
        score:            a.score ?? null,
        grade:            a.Grade || null,
        raw:              a
      };
    }).filter(Boolean);

	// insert only, if ArcGIS ever gives an ID again do nothing if conflict
    const { data, error } = await supa
      .from('inspections')
      .insert(rows, { count: 'exact' }); 

    if (error) throw error;

    const added = data?.length ?? 0;
    totalNew += added;
    console.log(`New inspections page ${++page} @${offset}: ${added} inserted`);

    offset += 1000;
  }

  console.log(`New inspections inserted: ${totalNew} (since ${sinceDate})`);
})().catch(err => {
  console.error('seed_inspections increment failed:', err);
  process.exit(1);
});
