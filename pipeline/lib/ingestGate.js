/**
 * lib/ingestGate.js — decides whether Louisville's load should run (source_check.js).
 *
 * The job is checked every two hours, but a load reads and rewrites a lot of the database
 * (docs/ARCHITECTURE.md), so it runs only when the city's data has changed. "Changed" is
 * decided from the city's own servers, without reading the database: one statistics
 * request per layer (row count plus sums of real columns), hashed into a fingerprint and
 * compared with the fingerprint of the last load, which GitHub's Actions cache keeps.
 *
 * Why sums and not the layer's edit date or its newest ObjectId: the city wipes and
 * re-uploads every layer once a day (around 13:45 UTC), so the edit date moves even when
 * nothing is new, and ObjectIds are renumbered 1..n each time. The inspections layer is a
 * rolling year, so its row count alone can stay the same while rows come and go.
 *
 * Pure: no network, no files. source_check.js does those.
 */
import { createHash } from "node:crypto";

const ARCGIS = "https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services";

// Every layer the load reads (seed_*.js, overlay_geometry.js, backfill_types.js), and the
// columns summed for its fingerprint. A test checks each seed script's URL is here.
export const LAYERS = [
  {
    name: "inspections",
    url: `${ARCGIS}/FoodServiceData/FeatureServer/0`,
    sums: ["InspectionID", "EstablishmentID", "score"],
  },
  {
    name: "violations",
    url: `${ARCGIS}/Louisville_Metro_KY_Inspection_Violations_of_Failed_Restaurants/FeatureServer/0`,
    sums: ["InspectionID", "InspTypeSpecificViolID"],
  },
  {
    name: "establishments",
    url: `${ARCGIS}/Louisville_Metro_KY_Permitted_Food_Service_Establishments/FeatureServer/0`,
    sums: ["permit_number", "facility_type", "subtype"],
  },
  {
    name: "types",
    url: `${ARCGIS}/Louisville_Metro_KY_Permitted_Food_Service_Types_with_Subtypes/FeatureServer/0`,
    sums: ["facility_type", "subtype"],
  },
];

// At most this many loads a day on the schedule, so a source that keeps changing (or a
// load that keeps failing) can't run all twelve checks into loads. A run by hand always loads.
export const MAX_LOADS_PER_DAY = 2;
// Load anyway when the last load is older than this: a row edited in place (same count,
// same sums) is caught within a week.
export const STALE_AFTER_DAYS = 7;
// The city re-uploads its three layers one after another over a few minutes. A check
// that lands while that's going on waits for the next one, so a half-published set
// isn't loaded and then loaded again.
export const PUBLISHING_MINUTES = 20;

const DAY = 24 * 60 * 60 * 1000;

/** The `outStatistics` parameter for one layer: its row count and each column's sum. */
export function statisticsFor(layer) {
  return JSON.stringify([
    { statisticType: "count", onStatisticField: "ObjectId", outStatisticFieldName: "n" },
    ...layer.sums.map((field) => ({
      statisticType: "sum",
      onStatisticField: field,
      outStatisticFieldName: `sum_${field}`,
    })),
  ]);
}

/**
 * One fingerprint for every layer's statistics: { layerName: attributes }. Key order
 * doesn't matter. Throws when a layer is missing or its count isn't a number, so a broken
 * answer can never look like "nothing changed".
 */
export function fingerprint(statsByLayer) {
  const parts = LAYERS.map(({ name }) => {
    const stats = statsByLayer[name];
    if (!stats || typeof stats.n !== "number") throw new Error(`No statistics for ${name}`);
    const sorted = Object.keys(stats)
      .sort()
      .map((k) => `${k}=${stats[k]}`);
    return `${name}:${sorted.join(",")}`;
  });
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);
}

/** YYYY-MM-DD in UTC. */
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * Whether to load, and the two states to save.
 *
 * @param {object} p
 * @param {object|null} p.state  the last saved state, or null (first run, or evicted):
 *   { fingerprint, day, loadsToday, lastLoadAt }
 * @param {string} p.fingerprint   the city's data now
 * @param {number} p.now           ms
 * @param {boolean} [p.manual]     run by hand: always load
 * @param {number|null} [p.newestEdit]  ms of the most recent layer edit, if known
 * @returns {{ run: boolean, reason: string, attempt?: object, done?: object }}
 *   attempt: saved before the load, so a failing load still counts toward the cap and is
 *   retried (its fingerprint is still the old one). done: saved after a successful load.
 */
export function decide({ state, fingerprint: fp, now, manual = false, newestEdit = null }) {
  const day = utcDay(now);
  const loadsToday = state?.day === day ? (state.loadsToday ?? 0) : 0;
  const lastLoadAt = state?.lastLoadAt ? Date.parse(state.lastLoadAt) : NaN;
  const changed = state?.fingerprint !== fp;
  const stale = !(now - lastLoadAt <= STALE_AFTER_DAYS * DAY);

  const plan = (reason) => ({
    run: true,
    reason,
    attempt: {
      fingerprint: state?.fingerprint ?? null,
      lastLoadAt: state?.lastLoadAt ?? null,
      day,
      loadsToday: loadsToday + 1,
    },
    done: {
      fingerprint: fp,
      lastLoadAt: new Date(now).toISOString(),
      day,
      loadsToday: loadsToday + 1,
    },
  });
  const skip = (reason) => ({ run: false, reason });

  if (manual) return plan("run by hand");
  if (newestEdit != null && now - newestEdit < PUBLISHING_MINUTES * 60 * 1000) {
    return skip("the city is publishing right now; the next check will see the whole set");
  }
  if (!changed && !stale) return skip(`nothing new since the load at ${state.lastLoadAt}`);
  if (loadsToday >= MAX_LOADS_PER_DAY) {
    return skip(`already loaded ${loadsToday} times today (the cap); tomorrow's first check will`);
  }
  if (!state) return plan("no earlier load remembered");
  return plan(changed ? "the city's data changed" : `no load for ${STALE_AFTER_DAYS} days`);
}
