// The signed-in user's saved places and watch areas. One save/unsave for the map popups
// and the info drawer, and the watch-area list the map draws as circles.
//
// The Saved panel (WatchlistTab.jsx) keeps its own fuller list of areas. The two stay in
// step without reading the database again: the panel hands its new list to setWatchAreas
// after it adds, removes or resizes one, and a circle moved or resized on the map is
// announced in areaEdit, which the panel applies to its list (lib/watchAreaEdits.js).
import { useCallback, useEffect, useState } from "react";
import {
  fetchSavedIds,
  fetchWatchAreas,
  savePlaces,
  unsavePlace,
  updateWatchArea,
} from "../../api/watchlist.js";
import { useLatest } from "../../hooks/useLatest.js";

// similarEids: establishment id -> other permits at the same place (useMapFeatures).
// onSignInNeeded: called when a signed-out visitor tries to save.
export function useWatchlist({ user, similarEids, onSignInNeeded }) {
  const [savedIds, setSavedIds] = useState(new Set());
  const [watchAreas, setWatchAreas] = useState([]);
  // The last area moved or resized on the map: { id, update, n }, n making each one new.
  const [areaEdit, setAreaEdit] = useState(null);
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
        const { error } = await unsavePlace(user.id, eid);
        if (error) return console.error("unsave failed", error);
        setSavedIds((prev) => withoutId(prev, eid));
        return;
      }
      const toAdd = [eid, ...similarEids(eid)].filter((e) => !saved.has(e));
      if (!toAdd.length) return;
      // Only show it saved once the database has it (e.g. the 30-place cap).
      const { error } = await savePlaces(user.id, toAdd);
      if (error) return console.error("save failed", error);
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
      setAreaEdit({ id: area.id, update, n: Date.now() }); // an open Saved panel follows
    },
    [latest],
  );

  return {
    savedIds,
    toggleSaved,
    forgetSaved,
    watchAreas,
    setWatchAreas,
    areaEdit,
    commitAreaEdit,
  };
}

function withoutId(set, eid) {
  const next = new Set(set);
  next.delete(eid);
  return next;
}
