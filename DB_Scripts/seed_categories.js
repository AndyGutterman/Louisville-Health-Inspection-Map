// seed_categories.js
import dotenv from "dotenv";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase    = createClient(supabaseUrl, supabaseKey);

async function seedCategories() {
  try {
    console.log("Fetching categories from ArcGIS…");
    const resp = await fetch(
      `https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/` +
      `Louisville_Metro_KY_Permitted_Food_Service_Types_with_Subtypes/FeatureServer/0/` +
      `query?where=1%3D1&outFields=facility_type,facility_type_description,subtype,subtype_description&` +
      `returnGeometry=false&f=json`
    );
    const { features } = await resp.json();

    // Transform into our table's shape
    const records = features.map(f => ({
      facility_type:              f.attributes.facility_type,
      facility_type_description:  f.attributes.facility_type_description,
      subtype:                    f.attributes.subtype,
      subtype_description:        f.attributes.subtype_description
    }));

    console.log(`Inserting ${records.length} category records into Supabase…`);
    const { data, error } = await supabase
      .from("facility_categories")
      .insert(records)
      .select(); // return inserted rows

    if (error) {
      throw error;
    }
    console.log(`Successfully inserted ${data.length} rows.`);
  } catch (err) {
    console.error("Seed failed:", err);
  }
}

seedCategories();
