// Every database call behind the pin control center (features/pins, docs/PINS.md). All
// run as the signed-in person: the admin_* functions check for an admin themselves
// (migration 20261130000000), so nothing here is a secret.
//
// Egress: a few dozen small rows a call. The queue comes a page at a time (at most 50
// rows, cut in the database), and Geocode now's progress is a read of the fixes being
// looked up, every 10 s for at most 5 minutes (lib/pinQueue.js keepPolling).
import { supabase } from "../lib/supabase.js";
import { PAGE_SIZE } from "../lib/pinQueue.js";
import { startWorkflow } from "./dispatch.js";

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** admin_pin_counts rows: { region, bucket, n }. */
export async function fetchPinCounts() {
  return must(await supabase.rpc("admin_pin_counts"));
}

/** One page of a county's queue (admin_pin_queue rows). */
export async function fetchPinQueue({ region, bucket, offset = 0 }) {
  return must(
    await supabase.rpc("admin_pin_queue", {
      p_region: region,
      p_bucket: bucket,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    }),
  );
}

/** Save a fix: lib/pinQueue.js fixArgs(...). Returns how many places were saved. */
export async function savePlaceFix(args) {
  return must(await supabase.rpc("admin_save_place_fix", args));
}

/** Undo a place's fix (its old pin comes back). */
export async function clearPlaceFix(placeId) {
  return must(await supabase.rpc("admin_clear_place_fix", { p_place_id: placeId }));
}

/** The outcome of some address fixes: { place_id, status, result_* } rows. */
export async function fetchFixStatus(ids) {
  return must(await supabase.rpc("admin_place_fix_status", { p_ids: ids }));
}

/** Start the pin-fixes job (pins-dispatch), which looks up every waiting address fix. */
export const startPinJob = () => startWorkflow("pins-dispatch");
