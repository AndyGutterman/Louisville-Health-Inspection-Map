import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Violations (failed restaurants only)
const FS = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Inspection_Violations_of_Failed_Restaurants/FeatureServer/0';

// Utilities
const normId = v => {
  if (v == null) return null;
  const s = String(v).replace(/,/g, '').trim();
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? String(n) : null;
};
const toISODate = ms => (ms ? new Date(ms).toISOString().slice(0, 10) : null);

async function fetchPage(offset, size = 2000) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: [
      'ObjectId',
      'EstablishmentID','InspectionID','InspectionDate','score','InspectionType','EstTypeDesc',
      'InspTypeSpecificViolID','ViolationDesc','critical_yn','Insp_Viol_Comments','rpt_area_id',
      'premise_name','premise_adr1_num','premise_adr1_street','premise_city','premise_state','premise_zip'
    ].join(','),
    orderByFields: 'InspectionDate DESC, InspectionID DESC',
    resultRecordCount: String(size),
    resultOffset: String(offset),
    returnGeometry: 'false',
    f: 'json',
  });

  const j = await fetch(`${FS}/query?${params}`).then(r => r.json());
  if (j.error) throw new Error(JSON.stringify(j.error));
  return (j.features || []).map(f => f.attributes);
}

(async function run() {
  let offset = 0, page = 0, total = 0;

  for (;;) {
    const attrs = await fetchPage(offset);
    if (!attrs.length) break;

    const rows = attrs.map(a => {
      const eid = normId(a.EstablishmentID);
      return {
        violation_oid: a.ObjectId,
        inspection_id: a.InspectionID ?? null,
        establishment_id: eid,
        inspection_date: toISODate(a.InspectionDate),
        score: a.score ?? null,
        ins_type_desc: a.InspectionType || a.EstTypeDesc || null,
        insp_type_specific_viol_id: a.InspTypeSpecificViolID ?? null,
        violation_desc: a.ViolationDesc || null,
        critical_yn: a.critical_yn || null,
        insp_viol_comments: a.Insp_Viol_Comments || null,
        rpt_area_id: a.rpt_area_id || null,
      };
    });

    const { error, count } = await supa
      .from('inspection_violations')
      .upsert(rows, { onConflict: 'violation_oid', count: 'exact' });

    if (error) throw error;
    total += (count ?? 0);
    console.log(`Page ${++page} @${offset}: upserted ~${rows.length}`);

    offset += 2000;
  }

  console.log(`Done. Upserted violations rows: ~${total}`);
})().catch(err => {
  console.error('seed_violations failed:', err);
  process.exit(1);
});

