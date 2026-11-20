/**
 * pins/fixJob.js — the pin-fixes job (pins/run.js, pin-fixes.yml): geocodes the address
 * fixes waiting in place_fixes with each county's full chain (lib/countyGeocode.js), and
 * puts each pin it finds inside the county on the map. The admin page polls the fixes'
 * status while this runs (docs/PINS.md).
 *
 *   found      a match inside the county: written to the place's table (live)
 *   outside    a match outside the county: kept on the fix for the admin to judge, not
 *              put on the map
 *   not_found  nothing matched: the admin can place the pin by hand
 *
 * At most `limit` fixes a run, oldest first; the rest wait for the next run. A fix the
 * admin changed while the job was looking it up is left as the admin saved it.
 */
import { readFileSync } from "node:fs";
import { countyGeocoder } from "../lib/countyGeocode.js";
import { DELAY_MS, sleep } from "../lib/geocode.js";
import { geocodeRegion, placesQuery } from "../lib/geocodeRegions.js";

export const LIMIT = 50;
const REPO = new URL("../../", import.meta.url);

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// The real geocoder for a region, with its fixes, so the corrected address is looked up.
export function regionGeocoder(region, fixes) {
  return countyGeocoder({
    outline: JSON.parse(readFileSync(new URL(region.outline, REPO), "utf8")),
    defaults: { city: region.defaultCity, state: "KY" },
    county911: region.county911,
    keyPrefix: region.keyPrefix,
    fixes,
    table: region.table,
  });
}

/**
 * @param {object} supa  a Supabase client with the service role
 * @param {object} [o]
 * @returns {Promise<{found: number, outside: number, notFound: number, left: number}>}
 */
export async function runFixJob(
  supa,
  {
    limit = LIMIT,
    log = console,
    geocoderFor = regionGeocoder,
    regionFor = geocodeRegion,
    delayMs = DELAY_MS,
  } = {},
) {
  const pending = must(
    await supa
      .from("place_fixes")
      .select("place_id, region, action, address, city, status, updated_at")
      .eq("status", "pending")
      .eq("action", "address")
      .order("updated_at")
      .limit(limit + 1),
    "read pending fixes",
  );
  const todo = pending.slice(0, limit);
  const tally = { found: 0, outside: 0, notFound: 0, left: pending.length - todo.length };
  log.log(`Address fixes waiting: ${todo.length}${tally.left ? " (more next run)" : ""}`);

  const byRegion = Map.groupBy(todo, (f) => f.region);
  for (const [regionId, fixes] of byRegion) {
    const region = regionFor(regionId);
    const places = new Map(
      must(
        await placesQuery(
          supa,
          region,
          fixes.map((f) => f.place_id),
        ),
        `read ${regionId} places`,
      ).map((p) => [p.id, p]),
    );
    const geo = geocoderFor(region, new Map(fixes.map((f) => [f.place_id, f])));

    for (const fix of fixes) {
      const place = places.get(fix.place_id);
      let outcome;
      if (!place) {
        outcome = { status: "not_found", result_query: "(the source no longer lists this place)" };
      } else {
        const { query, result } = await geo.geocode(place);
        await sleep(delayMs);
        const found = result?.lon != null;
        const inside = found && geo.inCounty(result);
        if (found) {
          must(
            await supa.from("geocode_cache").upsert(
              {
                key: geo.keyFor(place),
                lon: result.lon,
                lat: result.lat,
                provider: result.provider,
                confidence: result.confidence ?? null,
                meta: result.raw ?? null,
              },
              { onConflict: "key" },
            ),
            "save geocode cache",
          );
        }
        outcome = {
          status: inside ? "found" : found ? "outside" : "not_found",
          result_lon: found ? result.lon : null,
          result_lat: found ? result.lat : null,
          result_provider: found ? result.provider : null,
          result_query: query,
        };
      }

      // The outcome, and a pin found inside the county, in one transaction (migration
      // 20261130010000). Only for a fix still as it was read: an edit made meanwhile wins.
      const saved = must(
        await supa.rpc("place_fix_record_result", {
          p_place_id: fix.place_id,
          p_updated_at: fix.updated_at,
          p_status: outcome.status,
          p_lon: outcome.result_lon ?? null,
          p_lat: outcome.result_lat ?? null,
          p_provider: outcome.result_provider ?? null,
          p_query: outcome.result_query,
        }),
        "save the outcome",
      );
      if (saved !== true) {
        log.log(`  changed while looking it up, left as saved: ${fix.place_id}`);
        continue;
      }
      const name = place?.name ?? fix.place_id;
      if (outcome.status === "found") {
        tally.found++;
        log.log(`  ✓ ${name} — ${outcome.result_query} (${outcome.result_provider})`);
      } else if (outcome.status === "outside") {
        tally.outside++;
        log.warn(`  ! outside the county: ${name} — ${outcome.result_query}`);
      } else {
        tally.notFound++;
        log.warn(`  ✗ no match: ${name} — ${outcome.result_query}`);
      }
    }
  }
  log.log(
    `Found ${tally.found}, outside the county ${tally.outside}, not found ${tally.notFound}.`,
  );
  return tally;
}
