// seed_establishments.js
import dotenv from "dotenv";
import fetch  from "node-fetch";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

// — Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ArcGIS FeatureServer base URL (GeoJSON, paged)
const BASE_URL =
  "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/" +
  "FoodMapping/FeatureServer/0/query?where=1%3D1" +
  "&outFields=permit_number,premise_name,premise_address,premise_city,premise_state,premise_zip," +
             "opening_date,facility_type,facility_type_description," +
             "subtype,subtype_description,EHS" +
  "&returnGeometry=true&f=geojson";

const BATCH_SIZE = 999;

async function seedEstablishments() {
  // ─── STEP 0: clear out existing data ─────────────────────
  console.log("🗑️  Clearing old data…");
  await supabase.from("inspections").delete().neq("inspection_id", null);
  await supabase.from("establishments").delete().neq("id", null);
  console.log("✅ Cleared inspections & establishments.");

  // ─── STEP 1: fetch & collect all GeoJSON batches ─────────
  let offset = 0;
  const allRows     = [];
  const categoryMap = new Map();

  while (true) {
    const url = `${BASE_URL}&resultRecordCount=${BATCH_SIZE}&resultOffset=${offset}`;
    console.log(`⏳ Fetching batch offset=${offset}…`);
    const resp = await fetch(url);
    const json = await resp.json();

    if (!Array.isArray(json.features) || json.features.length === 0) {
      break;
    }

    for (const f of json.features) {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const ehsMatch = (p.EHS || "").match(/\d+/);
      const ehsNum   = ehsMatch ? parseInt(ehsMatch[0], 10) : null;

      // collect establishment row
      allRows.push({
        permit_number:   p.permit_number?.toString()   || null,
        premise_name:    p.premise_name                || null,
        premise_address: p.premise_address             || null,
        premise_city:    p.premise_city                || null,
        premise_state:   p.premise_state               || null,
        premise_zip:     p.premise_zip?.toString()     || null,
        opening_date:    p.opening_date
                             ? new Date(p.opening_date)
                                 .toISOString()
                                 .split("T")[0]
                             : null,
        latitude:        lat,
        longitude:       lon,
        facility_type:   p.facility_type               || null,
        subtype:         p.subtype                     || null,
        ehs_area:        ehsNum
      });

      // collect category metadata
      const key = `${p.facility_type}:${p.subtype}`;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, {
          facility_type:             p.facility_type,
          subtype:                   p.subtype,
          facility_type_description: p.facility_type_description,
          subtype_description:       p.subtype_description
        });
      }
    }

    offset += BATCH_SIZE;
  }

  console.log(`🗂️ Collected ${allRows.length} rows`);
  console.log(`🏷️ Found ${categoryMap.size} distinct categories`);

  // ─── STEP 2: upsert missing categories ───────────────────
  const { data: existingCats } = await supabase
    .from("facility_categories")
    .select("facility_type,subtype");
  const existingSet = new Set(
    existingCats.map(c => `${c.facility_type}:${c.subtype}`)
  );

  const toInsertCats = [];
  for (const [key, meta] of categoryMap) {
    if (!existingSet.has(key)) {
      toInsertCats.push(meta);
    }
  }
  if (toInsertCats.length) {
    console.log(`➕ Inserting ${toInsertCats.length} missing categories…`);
    await supabase
      .from("facility_categories")
      .insert(toInsertCats, { returning: false });
    console.log("✅ Categories upserted.");
  } else {
    console.log("✅ No new categories needed.");
  }

  // ─── STEP 3: upsert establishments ───────────────────────
  let i = 0;
  while (i < allRows.length) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    console.log(`🔄 Upserting establishments ${i}→${i + batch.length}…`);
    await supabase
      .from("establishments")
      .upsert(batch, { onConflict: ["permit_number"], returning: false });
    i += BATCH_SIZE;
  }

  console.log(`🎉 Seed complete! Total establishments handled: ${allRows.length}`);
}

seedEstablishments().catch(err => {
  console.error("🚨 Seeding failed:", err);
});
