// Supabase reads and writes for a signed-in user's saved places and watch areas.
// Row-level security limits every query to the user's own rows.
import { supabase } from "../lib/supabase.js";

// The establishment ids the user has saved.
export async function fetchSavedIds(userId) {
  const { data } = await supabase
    .from("watchlist")
    .select("establishment_id")
    .eq("user_id", userId);
  return new Set((data || []).map((r) => r.establishment_id));
}

export const savePlaces = (userId, eids) =>
  supabase.from("watchlist").insert(eids.map((e) => ({ user_id: userId, establishment_id: e })));

export const unsavePlace = (userId, eid) =>
  supabase.from("watchlist").delete().eq("user_id", userId).eq("establishment_id", eid);

// The user's watch areas (the circles on the map).
export async function fetchWatchAreas(userId) {
  const { data } = await supabase
    .from("watchlist_areas")
    .select("id, label, center_address, center_lat, center_lon, radius_miles")
    .eq("user_id", userId);
  return data || [];
}

export const updateWatchArea = (id, update) =>
  supabase.from("watchlist_areas").update(update).eq("id", id);
