/**
 * lib/countyGeocode.js — pins for a county whose source has no coordinates (Bullitt's
 * sheet, Kentucky's inspection portal). One geocoder per county; every county uses the
 * same steps, so a fix here helps them all.
 *
 * In order, the first match inside the county outline wins (lib/geocode.js firstInside):
 *   0. a pin placed by hand (the county's overrides.json, lib/overrides.js);
 *   1. an exact 911 address point: the county's record of that building (lib/ky911.js);
 *   2. the Census, which places the number along its street's address range;
 *   3. Nominatim inside the county's box, only when it matched the building itself (a
 *      street-level answer once put every address on Old Preston Hwy on one spot);
 *   4. the Census without the town (sources sometimes give the mailing town);
 *   5. a 911 point between neighbouring house numbers (ky911-approx).
 * If nothing lands inside the county, the first match is kept and flagged.
 *
 * Results are cached in geocode_cache under `<keyPrefix>|<query>`: a source often has the
 * mailing town (Hillview addresses say LOUISVILLE), so without the prefix a Louisville
 * lookup of the same text could stand in for this county's.
 */
import { buildStreetIndex, matchAddress } from "./addressPoints.js";
import { bbox, containsPoint } from "./geo.js";
import {
  DELAY_MS,
  buildQuery,
  cacheKey,
  geocodeCensus,
  geocodeCensusLine,
  geocodeNominatim,
  firstInside,
  sleep,
  stripSuite,
} from "./geocode.js";
import { fetchCountyAddressPoints } from "./ky911.js";
import { overrideFor } from "./overrides.js";

const CHUNK = 100;

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

const chunks = (list, n = CHUNK) =>
  Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// Straight-line distance between two { lon, lat } points, in km (fine at county scale).
export const distanceKm = (a, b) => {
  const kmPerDeg = 111.32;
  const dx = (a.lon - b.lon) * kmPerDeg * Math.cos((a.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * kmPerDeg;
  return Math.hypot(dx, dy);
};

/**
 * @param {object} county
 * @param {object} county.outline     the county's GeoJSON outline (apps/web/public/regions)
 * @param {{city: string, state: string}} county.defaults  for rows missing a town
 * @param {string} county.county911   the county as Kentucky's 911 layer writes it
 * @param {string} county.keyPrefix   geocode_cache key prefix, e.g. "bullitt"
 * @param {Map} county.overrides      lib/overrides.js parseOverrides(...)
 * @param {string} county.table       the establishments table holding lon/lat
 * @param {(query: object) => object} [county.scope]  narrows reads of `table` to this
 *   county (the portal's table holds every portal county)
 * @param {object} [deps]             stand-ins for tests
 */
export function countyGeocoder(
  { outline, defaults, county911, keyPrefix, overrides, table, scope = (q) => q },
  {
    log = console,
    addressPoints = fetchCountyAddressPoints,
    geocoders = { geocodeCensus, geocodeCensusLine, geocodeNominatim },
    delayMs = DELAY_MS,
  } = {},
) {
  const [W, S, E, N] = bbox(outline);
  const searchBox = [W - 0.02, S - 0.02, E + 0.02, N + 0.02]; // about 2 km of slack
  const inCounty = (r) => !!r && containsPoint(outline, [r.lon, r.lat]);
  const queryFor = (row) => buildQuery(row, defaults);
  const keyFor = (row) => `${keyPrefix}|${cacheKey(queryFor(row))}`;

  // The county's 911 address points, downloaded the first time a place needs them (about
  // 10 requests). Null if the state's server is down: that step is then skipped.
  let streets = null;
  const addressPointStreets = () =>
    (streets ??= addressPoints(county911)
      .then((points) => {
        const index = buildStreetIndex(points);
        log.log(`  KY 911 address points: ${points.length} on ${index.length} streets`);
        return index;
      })
      .catch((e) => {
        log.error(`  KY 911 address points unavailable: ${e.message}`);
        return null;
      }));

  async function geocode(row) {
    const query = queryFor(row);
    const fixed = overrideFor(overrides, row, defaults);
    if (fixed) {
      const { lon, lat, note } = fixed;
      return { query, result: { lon, lat, provider: "manual", confidence: 1, raw: { note } } };
    }
    const street = stripSuite(row.address || "");
    let approx911 = null;
    const result = await firstInside(
      [
        async () => {
          const index = await addressPointStreets();
          const m = index && matchAddress(index, { address: street, city: row.city });
          if (m?.provider === "ky911-approx") {
            approx911 = m; // a guess between neighbours: only if nothing better turns up
            return null;
          }
          return m;
        },
        // The Census needs a street: without one it answers HTTP 400 ("LA GRANGE, KY").
        async () => (street ? geocoders.geocodeCensus(row, defaults) : null),
        () => geocoders.geocodeNominatim(query, { viewbox: searchBox }),
        async () =>
          street ? geocoders.geocodeCensusLine(`${street}, KY`, { accept: inCounty }) : null,
        async () => approx911,
      ],
      inCounty,
      { onError: (e) => log.error(`  geocode error for "${query}": ${e.message}`) },
    );
    return { query, result };
  }

  // Every run, before geocoding: put each hand-placed pin on its places, including ones a
  // geocoder already pinned.
  async function applyOverrides(supa) {
    if (!overrides.size) return 0;
    const rows = must(
      await scope(
        supa.from(table).select("id, name, address, city, state, lon, lat, geocode_provider"),
      ),
      "read places for hand-placed pins",
    );
    let updated = 0;
    for (const row of rows) {
      const o = overrideFor(overrides, row, defaults);
      if (!o || (row.geocode_provider === "manual" && row.lon === o.lon && row.lat === o.lat)) {
        continue;
      }
      must(
        await supa
          .from(table)
          .update({
            lon: o.lon,
            lat: o.lat,
            geocode_provider: "manual",
            geocode_query: queryFor(row),
            geocode_outside_county: !inCounty(o),
            geocoded_at: new Date().toISOString(),
          })
          .eq("id", row.id),
        "save hand-placed pin",
      );
      updated++;
    }
    log.log(`Hand-placed pins: ${overrides.size} in overrides.json, ${updated} places updated.`);
    return updated;
  }

  // Places with no pin yet (and, with retryFailures, ones that failed before). With redo,
  // every active place except hand-placed ones, ignoring the cache.
  async function geocodeMissing(supa, { retryFailures = false, redo = false } = {}) {
    let q = scope(supa.from(table).select("id, name, address, city, state, lon, lat")).eq(
      "active",
      true,
    );
    if (redo) q = q.or("geocode_provider.is.null,geocode_provider.neq.manual");
    else {
      q = q.is("lon", null);
      if (!retryFailures) q = q.is("geocoded_at", null);
    }
    const todo = must(await q, "read places to geocode");
    log.log(`Places to geocode: ${todo.length}${redo ? " (redoing all)" : ""}`);
    const tally = { hits: 0, outside: 0, misses: 0, moved: 0 };
    if (!todo.length) return tally;

    const cached = new Map();
    for (const part of chunks([...new Set(todo.map(keyFor))])) {
      must(
        await supa.from("geocode_cache").select("key, lon, lat, provider").in("key", part),
        "read geocode cache",
      ).forEach((c) => cached.set(c.key, c));
    }

    for (const row of todo) {
      const key = keyFor(row);
      let result = redo ? null : cached.get(key);
      let query = queryFor(row);
      if (!result || (result.lon == null && retryFailures)) {
        ({ query, result } = await geocode(row));
        must(
          await supa.from("geocode_cache").upsert(
            {
              key,
              lon: result?.lon ?? null,
              lat: result?.lat ?? null,
              provider: result?.provider ?? null,
              confidence: result?.confidence ?? null,
              meta: result?.raw ?? null,
            },
            { onConflict: "key" },
          ),
          "save geocode cache",
        );
        await sleep(delayMs);
      }
      const found = result?.lon != null;
      const out = found && !inCounty(result);
      must(
        await supa
          .from(table)
          .update({
            lon: found ? result.lon : null,
            lat: found ? result.lat : null,
            geocode_provider: found ? result.provider : null,
            geocode_query: query,
            geocode_outside_county: found ? out : null,
            geocoded_at: new Date().toISOString(),
          })
          .eq("id", row.id),
        "save coordinates",
      );
      if (redo && row.lon != null) {
        const km = found ? distanceKm(row, result) : null;
        if (km == null || km > 0.05) {
          tally.moved++;
          log.log(
            `  moved: ${row.name} — ${km == null ? "pin removed (no match)" : `${km.toFixed(2)} km`} (${result?.provider ?? "none"})`,
          );
        }
      }
      if (!found) {
        tally.misses++;
        log.warn(`  ✗ no match: ${row.name} — ${query}`);
      } else if (out) {
        tally.outside++;
        log.warn(`  ! outside the county: ${row.name} — ${query} (${result.provider})`);
      } else tally.hits++;
    }
    log.log(
      `Geocoded ${tally.hits} in the county, ${tally.outside} outside it (still pinned), ${tally.misses} not found.` +
        (redo ? ` ${tally.moved} pins moved more than 50 m or were removed.` : ""),
    );
    return tally;
  }

  return { geocode, applyOverrides, geocodeMissing, inCounty, queryFor, keyFor };
}
