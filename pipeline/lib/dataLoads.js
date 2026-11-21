/**
 * lib/dataLoads.js — tells the website a county's data changed (table data_loads,
 * migration 20261203000000). The website keeps each county's pins in the browser until
 * this time moves (apps/web/src/lib/mapCache.js), so a load reaches visitors on their next
 * visit, and a day with no load costs them nothing.
 *
 * Never stops a job: the load itself already succeeded. Before the migration has been run
 * there is no table, and the website falls back to refreshing once a day.
 */

const missingTable = (error) =>
  error?.code === "42P01" ||
  error?.code === "PGRST205" ||
  /data_loads.*(does not exist|schema cache)/.test(error?.message ?? "");

/**
 * Stamps `region` as loaded now. Resolves to true when stamped, false when not (logged).
 * @param {object} supa  a Supabase client with the service role
 * @param {string} region  a county id from packages/core/regions.js, e.g. "jefferson"
 */
export async function markLoaded(supa, region, { now = new Date(), log = console } = {}) {
  if (!/^[a-z]+$/.test(region ?? "")) throw new Error(`Not a county id: ${region}`);
  const { error } = await supa
    .from("data_loads")
    .upsert({ region, loaded_at: now.toISOString() }, { onConflict: "region" });
  if (!error) {
    log.log(`Marked ${region} as loaded at ${now.toISOString()}.`);
    return true;
  }
  log.warn(
    missingTable(error)
      ? "data_loads isn't there yet (migration 20261203000000): visitors' pins refresh daily until it is."
      : `Couldn't mark ${region} as loaded (${error.message}); visitors' pins refresh daily until the next load.`,
  );
  return false;
}
