import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function seedCategories() {
  console.log("Fetching categories from ArcGIS…");
  const url = [
    `https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/`,
    `Louisville_Metro_KY_Permitted_Food_Service_Types_with_Subtypes/FeatureServer/0/query`,
    `?where=1=1`,
    `&outFields=facility_type,facility_type_description,subtype,subtype_description`,
    `&returnGeometry=false&f=json`
  ].join('');
  const { features } = await fetch(url).then(r => r.json());
  const records = features.map(f => ({
    facility_type:             f.attributes.facility_type,
    facility_type_description: f.attributes.facility_type_description,
    subtype:                   f.attributes.subtype,
    subtype_description:       f.attributes.subtype_description
  }));

  console.log(`Inserting ${records.length} category rows…`);
  const { data, error } = await supa
    .from("facility_categories")
    .insert(records)
    .select();
  if (error) throw error;
  console.log(`Inserted ${data.length} categories.`);
}

seedCategories().catch(err => console.error("seed_categories failed:", err));
