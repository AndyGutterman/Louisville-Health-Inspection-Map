import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const FS   = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer/0';

// normalize numbers that sometimes come with commas
const normId = v => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n) : null;
};

const toISODate = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

// fetch one page, get newest first
async function fetchPageDESC(offset, size = 1000) {
  const p = new URLSearchParams({
    where: '1=1',
    outFields: 'EstablishmentID,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
    orderByFields: 'InspectionDate DESC, InspectionID DESC',
    resultRecordCount: String(size),
    resultOffset: String(offset),
    returnGeometry: 'false',
    f: 'json',
  });
  const j = await fetch(`${FS}/query?${p}`).then(r => r.json());
  if (j.error) throw new Error(JSON.stringify(j.error));
  return (j.features || []).map(f => f.attributes);
}

(async function run() {
  // newest date we already have stored
  const { data: maxRow, error: e1 } = await supa
    .from('inspections')
    .select('inspection_date')
    .order('inspection_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;

  const cutoff = maxRow?.inspection_date || '1900-01-01';
  console.log('Cutoff date in DB:', cutoff);

  let offset = 0;
  let page = 0;
  let totalNew = 0;

  while (true) {
    const attrs = await fetchPageDESC(offset);
    if (!attrs.length) break;

    // map everything in the page
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

    // keep only items newer than the cutoff
    const fresh = rows.filter(r => r.inspection_date && r.inspection_date > cutoff);

    if (fresh.length) {
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

	// Since pages DESC by date, if the last row on this page is at or before the cutoff,
	// then all later pages will also be older, so we stop.
    const lastDate = rows[rows.length - 1]?.inspection_date || '1900-01-01';
    if (lastDate <= cutoff) break;

    offset += 1000;
  }

  console.log(`New inspections upserted: ${totalNew} (cutoff ${cutoff})`);
})().catch(err => {
  console.error('seed_inspections (incremental) failed:', err);
  process.exit(1);
});
