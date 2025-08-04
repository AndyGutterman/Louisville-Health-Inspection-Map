// seed_inspections.js
import dotenv    from "dotenv";
import fetch     from "node-fetch";
import { createClient } from "@supabase/supabase-js";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// ArcGIS REST endpoint for EVERY inspection event
const BASE_URL =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/arcgis/rest/services/FoodServiceData/FeatureServer/0/query?" +
  "where=1%3D1&outFields=EstablishmentID,InspectionID,Ins_TypeDesc,TypeDescription,InspectionDate,score,Grade,NameSearch&f=geojson";

// ArcGIS caps at 1000 per page
const BATCH = 999;

async function seedInspections() {
  console.log("🗑 Clearing old inspections…");
  await supabase.from("violations").delete().neq("violation_id", null);  // clear child first
  await supabase.from("inspections").delete().neq("inspection_id", null);
  console.log("✅ Cleared.");

  let offset = 0, total = 0;
  while (true) {
    console.log(`⏳ Fetching inspections offset=${offset}…`);
    const resp = await fetch(`${BASE_URL}&resultRecordCount=${BATCH}&resultOffset=${offset}`);
    const { features } = await resp.json();
    if (!features || !features.length) break;

    // map ArcGIS props → our table columns
    const rows = features.map(f => {
      const p = f.properties;
      return {
        inspection_id:    p.InspectionID,
        establishment_id: p.EstablishmentID.toString(),
        inspection_date:  new Date(p.InspectionDate).toISOString().slice(0,10),
        score:            p.score,
        grade:            p.Grade,
        inspection_type:  p.Ins_TypeDesc,
        name_search:      p.NameSearch
      };
    });

    console.log(`📥 Inserting ${rows.length} inspections…`);
    const { error } = await supabase
      .from("inspections")
      .upsert(rows, { onConflict: ["inspection_id"], returning: false });
    if (error) throw error;

    total += rows.length;
    offset += BATCH;
  }

  console.log(`🎉 Seeded ${total} inspections.`);
}

seedInspections().catch(err => console.error("🚨", err));
