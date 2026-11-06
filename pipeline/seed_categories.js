import { supa }            from './lib/db.js';
import { fetchArcGISPage } from './lib/arcgis.js';

const FS_BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/Louisville_Metro_KY_Permitted_Food_Service_Types_with_Subtypes/FeatureServer/0';

(async function run() {
  const attrs = await fetchArcGISPage(FS_BASE, {
    where:     '1=1',
    outFields: 'facility_type,facility_type_description,subtype,subtype_description',
  });

  const records = attrs.map(a => ({
    facility_type:             a.facility_type,
    facility_type_description: a.facility_type_description,
    subtype:                   a.subtype,
    subtype_description:       a.subtype_description,
  }));

  const { data, error } = await supa
    .from('facility_categories')
    .upsert(records, { onConflict: 'facility_type,subtype' })
    .select();
  if (error) throw error;
  console.log(`seed_categories complete — ${data.length} categories upserted.`);
})().catch(err => { console.error('seed_categories failed:', err); process.exit(1); });