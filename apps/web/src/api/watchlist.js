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

// ── The Saved panel (WatchlistTab.jsx). Each returns the request: { data, error }. ──────

// Saved places with each one's latest inspection.
export const fetchSavedPlaces = (userId) =>
  // check-allow: no-select-star-in-browser the user's own saved places, capped at 30 rows
  supabase.from("v_watchlist_with_latest").select("*").eq("user_id", userId);

// The user's watch areas in full, newest first.
export const fetchWatchAreaRows = (userId) =>
  supabase
    .from("watchlist_areas")
    // check-allow: no-select-star-in-browser the user's own watch areas, capped at 3 rows
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

// The places inside a watch area: most violations first, then failing, then lowest score.
// The database sorts and cuts the list, so a busy area costs `limit` rows, not thousands.
export const fetchZonePlaces = (areaId, limit) =>
  supabase
    .rpc("watch_zone_places", { p_area_id: areaId })
    .order("violations_6mo", { ascending: false })
    .order("failing", { ascending: false })
    .order("score", { ascending: true, nullsFirst: false })
    .limit(limit);

// By the saved row's own id (the Saved panel has it; the map saves and unsaves by place).
export const removeSavedPlace = (id) => supabase.from("watchlist").delete().eq("id", id);

// Adds a watch area and returns the new row.
export const addWatchArea = (area) =>
  supabase.from("watchlist_areas").insert([area]).select().single();

export const removeWatchArea = (id) => supabase.from("watchlist_areas").delete().eq("id", id);
