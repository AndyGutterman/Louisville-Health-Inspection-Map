// When each county's data last finished loading (data_loads, migration 20261203000000):
// the map keeps its saved pins until this moves (lib/mapCache.js). One read per page, of
// two short rows (about 100 bytes), before the map reads any pins
// (features/map/useMapFeatures.js); never again on a re-render, county toggle or tab switch.
import { publicDb } from "../lib/supabase.js";
import { retry } from "../lib/retry.js";

// Short: the map waits for this before reading pins, and without it the cache simply
// falls back to refreshing once a day.
const TIME_LIMIT_MS = 2500;

/**
 * Resolves to { regionId: loaded_at } (e.g. { jefferson: "2026-11-21T14:31:02+00:00" }),
 * or to null when the read fails or the table isn't there yet. Never rejects.
 */
export async function fetchDataLoads() {
  try {
    const rows = await retry(
      async (signal) => {
        const { data, error } = await publicDb
          .from("data_loads")
          .select("region,loaded_at")
          .abortSignal(signal);
        if (error) throw error;
        return data ?? [];
      },
      { tries: 1, ms: TIME_LIMIT_MS },
    );
    return Object.fromEntries(rows.map((r) => [r.region, r.loaded_at]));
  } catch {
    return null;
  }
}
