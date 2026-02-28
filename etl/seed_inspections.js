import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FS   = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

const normId = v => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n) : null;
};
const toISODate = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

async function fetchPageDESC(offset, size = 1000, attempt = 1) {
  const p = new URLSearchParams({
    where: '1=1',
    outFields: 'EstablishmentID,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
    orderByFields: 'InspectionDate DESC, InspectionID DESC',
    resultRecordCount: String(size),
    resultOffset: String(offset),
    returnGeometry: 'false',
    f: 'json',
  });

  const res = await fetch(`${FS}/query?${p}`);
  const text = await res.text();

  if (!res.ok) {
    console.error(`HTTP ${res.status} at offset ${offset}`);
  }

  try {
    const j = JSON.parse(text);
    if (j.error) throw new Error(JSON.stringify(j.error));
    return (j.features || []).map(f => f.attributes);
  } catch (err) {
    console.error(`ArcGIS returned non-JSON at offset ${offset}`);
    console.error(text.slice(0, 300));

    if (attempt < 3) {
      console.log(`Retrying offset ${offset} (attempt ${attempt + 1})`);
      await new Promise(r => setTimeout(r, 1000 * attempt));
      return fetchPageDESC(offset, size, attempt + 1);
    }

    throw err;
  }
}

(async function run() {
  const { data: maxRow, error: e1 } = await supa
    .from('inspections')
    .select('inspection_date')
    .order('inspection_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;

  const cutoff = maxRow?.inspection_date || '1900-01-01';
  console.log('Cutoff date in DB:', cutoff);

  const { data: facRows, error: e2 } = await supa
    .from('facilities')
    .select('establishment_id');
  if (e2) throw e2;
  const haveFacility = new Set((facRows || []).map(r => r.establishment_id));

  let offset = 0;
  let page = 0;
  let totalNew = 0;

  for (;;) {
    const attrs = await fetchPageDESC(offset);
    if (!attrs.length) break;

    const rows = attrs.map(a => {
      const eid = normId(a.EstablishmentID);
      if (!eid) return null;
      return {
        inspection_id: a.InspectionID,
        establishment_id: eid,
        ins_type_desc: a.Ins_TypeDesc || null,
        inspection_date: toISODate(a.InspectionDate),
        score: a.score ?? null,
        grade: a.Grade || null,
        raw: a,
      };
    }).filter(Boolean);

    const fresh = rows.filter(r => r.inspection_date && r.inspection_date > cutoff);

    if (fresh.length) {
      const missingEids = Array.from(new Set(fresh.map(r => r.establishment_id)))
        .filter(eid => !haveFacility.has(eid));

      if (missingEids.length) {
        const placeholders = missingEids.map(eid => ({
          establishment_id: eid,
          permit_number: eid,
          loc_source: 'legacy'
        }));
        const { error: fke } = await supa
          .from('facilities')
          .upsert(placeholders, { onConflict: 'establishment_id' });
        if (fke) throw fke;
        missingEids.forEach(eid => haveFacility.add(eid));
      }

      const { data, error } = await supa
        .from('inspections')
        .upsert(fresh, { onConflict: 'inspection_id', count: 'exact' });
      if (error) throw error;

      const added = data?.length ?? 0;
      totalNew += added;
      console.log(`Page ${++page} @${offset}: ${added} new (upserted)`);
    } else {
      console.log(`Page ${++page} @${offset}: 0 new (all <= cutoff)`);
    }

    const lastDate = rows[rows.length - 1]?.inspection_date || '1900-01-01';
    if (lastDate <= cutoff) break;

    offset += 1000;
  }

  console.log(`New inspections upserted: ${totalNew} (cutoff ${cutoff})`);
})().catch(err => {
  console.error('seed_inspections (incremental) failed:', err);
  process.exit(1);
});