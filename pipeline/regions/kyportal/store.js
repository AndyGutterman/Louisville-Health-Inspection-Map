/**
 * regions/kyportal/store.js — writes one parsed portal county to Supabase (tables in
 * supabase/migrations/20261119000000_portal_counties.sql). plan.js decides what to write.
 *
 *   1. Compare with the last load (portal_regions). Unchanged: only last_checked_at moves.
 *   2. Stop if the county shrank to under half (a broken page, not real closures).
 *   3. Add or update each place; places no longer listed become inactive.
 *   4. Add results not seen before; mark the rest as seen today.
 *   5. Record the read in portal_regions.
 *
 * Touches only this county's rows (`region`), and only portal_* tables: Jefferson's and
 * Bullitt's loads are separate jobs with their own sources.
 */
import { checkShrink, contentSha256, inspectionKey, planLoad } from "./plan.js";

const CHUNK = 500;
const PAGE = 1000;
// Reads stop here and fail rather than loop on: 20 pages is 20,000 rows, far more than
// any county the portal can serve on one page (999).
const MAX_PAGES = 20;

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const chunks = (list, n = CHUNK) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// Every row of a query, a page at a time, capped at MAX_PAGES.
async function readAll(makeQuery, what) {
  const all = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = must(await makeQuery().range(page * PAGE, page * PAGE + PAGE - 1), what);
    all.push(...rows);
    if (rows.length < PAGE) return all;
  }
  throw new Error(`${what}: more than ${MAX_PAGES * PAGE} rows; stopping`);
}

/**
 * @param {object} supa      a Supabase client with the service role
 * @param {object} county    counties.js entry
 * @param {object[]} establishments  parsePortalPage(...).establishments
 * @param {object} [opts]
 * @param {string} opts.day  today, YYYY-MM-DD
 * @param {Date} [opts.now]
 * @returns {Promise<object>} what happened, for the log
 */
export async function storeCounty(supa, county, establishments, { day, now = new Date() }) {
  const region = county.id;
  const at = now.toISOString();
  const sha = contentSha256(establishments);
  const inspectionCount = establishments.reduce((n, e) => n + e.inspections.length, 0);

  const [last] = must(
    await supa
      .from("portal_regions")
      .select("content_sha256, place_count, last_changed_at")
      .eq("region", region)
      .limit(1),
    "read the last load",
  );
  if (last?.content_sha256 === sha) {
    must(
      await supa.from("portal_regions").update({ last_checked_at: at }).eq("region", region),
      "record the read",
    );
    return { unchanged: true, since: last.last_changed_at };
  }
  checkShrink(establishments.length, last);

  const ids = new Set(
    (
      await readAll(
        () => supa.from("portal_establishments").select("id").eq("region", region),
        "read places",
      )
    ).map((r) => r.id),
  );
  const inspections = new Set(
    (
      await readAll(
        () =>
          supa
            .from("portal_inspections")
            .select("establishment_id, kind, content_hash")
            .eq("region", region),
        "read inspections",
      )
    ).map(inspectionKey),
  );
  const plan = planLoad(establishments, { ids, inspections }, region, day);

  for (const part of chunks(plan.addedPlaces)) {
    must(await supa.from("portal_establishments").insert(part), "add places");
  }
  for (const part of chunks(plan.keptPlaces)) {
    must(
      await supa.from("portal_establishments").upsert(part, { onConflict: "id" }),
      "update places",
    );
  }
  const gone = must(
    await supa
      .from("portal_establishments")
      .update({ active: false })
      .eq("region", region)
      .eq("active", true)
      .lt("last_seen", day)
      .select("id"),
    "mark missing places inactive",
  );
  for (const part of chunks(plan.freshInspections)) {
    must(await supa.from("portal_inspections").insert(part), "add inspections");
  }
  for (const part of chunks(plan.keptInspections)) {
    must(
      await supa
        .from("portal_inspections")
        .upsert(part, { onConflict: "establishment_id,kind,content_hash" }),
      "update inspections",
    );
  }

  must(
    await supa.from("portal_regions").upsert(
      {
        region,
        county_number: county.number,
        last_checked_at: at,
        last_changed_at: at,
        content_sha256: sha,
        place_count: establishments.length,
        inspection_count: inspectionCount,
      },
      { onConflict: "region" },
    ),
    "record the read",
  );

  return {
    unchanged: false,
    places: establishments.length,
    newPlaces: plan.addedPlaces.length,
    gonePlaces: gone.length,
    newInspections: plan.freshInspections.length,
  };
}
