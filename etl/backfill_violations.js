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

// BEFORE=: YYYY-MM-DD — backfill rows with inspection_date <= BEFORE.
// If omitted, we'll use the MIN date currently in your DB (so you can backfill everything older than what you have).
const arg = process.argv.find(a => a.startsWith('--before='));
const BEFORE = (arg && arg.split('=')[1]) || process.env.BEFORE;

async function fetchPageASC(offset, size = 2000) {
  const p = new URLSearchParams({
    where: '1=1',
    outFields: 'EstablishmentID,InspectionID,Ins_TypeDesc,InspectionDate,score,Grade',
    orderByFields: 'InspectionDate ASC, InspectionID ASC',
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
  // find min date we already have (so we only backfill OLDER than that)
  const { data: minRow, error: e1 } = await supa
    .from('inspections')
    .select('inspection_date')
    .order('inspection_date', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (e1) throw e1;

  const stopAt = BEFORE || minRow?.inspection_date || '9999-12-31';
  console.log('Backfilling rows with inspection_date <=', stopAt);

  let offset = 0, total = 0, page = 0;

  while (true) {
    const attrs = await fetchPageASC(offset);
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

    const olderOrEqual = rows.filter(r => r.inspection_date && r.inspection_date <= stopAt);
    if (olderOrEqual.length) {
      const { error } = await supa
        .from('inspections')
        .upsert(olderOrEqual, { onConflict: 'inspection_id' });
      if (error) throw error;
      total += olderOrEqual.length;
    }

    // if the newest row on this ASC page is already > stopAt, keep paging
    const maxOnPage = rows[rows.length - 1]?.inspection_date || '0000-01-01';
    // Once even the FIRST row on the page is > stopAt, we have stepped past the window.
    if (rows[0]?.inspection_date > stopAt) break;

    console.log(`Page ${++page} @${offset}: processed ~${rows.length}`);
    offset += 2000;
  }

  console.log(`Backfill complete. Upserted ~${total} older rows.`);
})().catch(err => {
  console.error('backfill_inspections failed:', err);
  process.exit(1);
});

