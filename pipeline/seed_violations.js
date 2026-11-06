import { supa }        from './lib/db.js';
import { normId, toISODate } from './lib/utils.js';
import { paginateArcGIS }    from './lib/arcgis.js';

const FS_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Inspection_Violations_of_Failed_Restaurants/FeatureServer/0';

const FIELDS = [
  'ObjectId',
  'EstablishmentID','InspectionID','InspectionDate','score','InspectionType','EstTypeDesc',
  'InspTypeSpecificViolID','ViolationDesc','critical_yn','Insp_Viol_Comments','rpt_area_id',
  'premise_name','premise_adr1_num','premise_adr1_street','premise_city','premise_state','premise_zip',
].join(',');

(async function run() {
  let total = 0;

  for await (const { attrs, page, offset } of paginateArcGIS(FS_BASE, {
    where:         '1=1',
    outFields:     FIELDS,
    orderByFields: 'InspectionDate DESC, InspectionID DESC',
  })) {
    const rows = attrs.map(a => ({
      violation_oid:              a.ObjectId,
      inspection_id:              a.InspectionID ?? null,
      establishment_id:           normId(a.EstablishmentID),
      inspection_date:            toISODate(a.InspectionDate),
      score:                      a.score ?? null,
      ins_type_desc:              a.InspectionType || a.EstTypeDesc || null,
      insp_type_specific_viol_id: a.InspTypeSpecificViolID ?? null,
      violation_desc:             a.ViolationDesc || null,
      critical_yn:                a.critical_yn || null,
      insp_viol_comments:         a.Insp_Viol_Comments || null,
      rpt_area_id:                a.rpt_area_id || null,
    }));

    const { error, count } = await supa
      .from('inspection_violations')
      .upsert(rows, { onConflict: 'violation_oid', count: 'exact' });

    if (error) throw error;
    total += count ?? 0;
    console.log(`Page ${page} @${offset}: upserted ~${rows.length}`);
  }

  console.log(`Done. Upserted violations rows: ~${total}`);
})().catch(err => { console.error('seed_violations failed:', err); process.exit(1); });