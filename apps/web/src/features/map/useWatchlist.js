// The signed-in user's saved places and watch areas. One save/unsave for the map popups
// and the info drawer, and the watch-area list the map draws as circles.
import { useCallback, useEffect, useState } from "react";
import {
  fetchSavedIds,
  fetchWatchAreas,
  savePlaces,
  unsavePlace,
  updateWatchArea,
} from "../../api/watchlist.js";
import { useLatest } from "../../hooks/useLatest.js";

// The account page and the map announce watch-area edits with this window event.
const AREAS_CHANGED = "watch-areas-changed";

// similarEids: establishment id -> other permits at the same place (useMapFeatures).
// onSignInNeeded: called when a signed-out visitor tries to save.
export function useWatchlist({ user, similarEids, onSignInNeeded }) {
  const [savedIds, setSavedIds] = useState(new Set());
  const [watchAreas, setWatchAreas] = useState([]);
  const latest = useLatest({ savedIds, watchAreas, onSignInNeeded });

  useEffect(() => {
    if (!user) {
      setSavedIds(new Set());
      return;
    }
    fetchSavedIds(user.id).then(setSavedIds);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setWatchAreas([]);
      return;
    }
    fetchWatchAreas(user.id).then(setWatchAreas);
    // Reload when the account page adds, removes or resizes an area, so new circles show.
    const reload = (e) => {
      if (e?.detail?.source === "map") return; // our own edit; state is already current
      fetchWatchAreas(user.id).then(setWatchAreas);
    };
    window.addEventListener(AREAS_CHANGED, reload);
    return () => window.removeEventListener(AREAS_CHANGED, reload);
  }, [user]);

  // Saving also saves similar nearby permits (the same place under another permit
  // record). Unsaving removes only the one clicked.
  const toggleSaved = useCallback(
    async (eid) => {
      if (!eid) return;
      if (!user) {
        latest.current.onSignInNeeded();
        return;
      }
      const saved = latest.current.savedIds;
      if (saved.has(eid)) {
        await unsavePlace(user.id, eid);
        setSavedIds((prev) => withoutId(prev, eid));
        return;
      }
      const toAdd = [eid, ...similarEids(eid)].filter((e) => !saved.has(e));
      if (!toAdd.length) return;
      await savePlaces(user.id, toAdd);
      setSavedIds((prev) => new Set([...prev, ...toAdd]));
    },
    [user, similarEids, latest],
  );

  // The account page already deleted it; just update the bookmark buttons.
  const forgetSaved = useCallback((eid) => setSavedIds((prev) => withoutId(prev, eid)), []);

  // Saves a watch area the user moved or resized on the map.
  const commitAreaEdit = useCallback(
    async (area, patch) => {
      const prev = latest.current.watchAreas.find((a) => a.id === area.id) || area;
      const update = { radius_miles: patch.radius_miles };
      if (patch.center_lat !== prev.center_lat || patch.center_lon !== prev.center_lon) {
        update.center_lat = patch.center_lat;
        update.center_lon = patch.center_lon;
        update.center_address = `${patch.center_lat.toFixed(4)}, ${patch.center_lon.toFixed(4)}`;
      }
      const { error } = await updateWatchArea(area.id, update);
      if (error) return;
      setWatchAreas((list) => list.map((a) => (a.id === area.id ? { ...a, ...update } : a)));
      // Lets an open account panel refresh this area
      window.dispatchEvent(new CustomEvent(AREAS_CHANGED, { detail: { source: "map" } }));
    },
    [latest],
  );

  return { savedIds, toggleSaved, forgetSaved, watchAreas, commitAreaEdit };
}

function withoutId(set, eid) {
  const next = new Set(set);
  next.delete(eid);
  return next;
}
