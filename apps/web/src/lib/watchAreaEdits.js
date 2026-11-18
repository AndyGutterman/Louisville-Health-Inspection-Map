// A watch area moved or resized on the map (features/map/useWatchlist.js), applied to the
// Saved panel's list of areas (WatchlistTab.jsx) without reading them again.

/**
 * @param {object[]} areas          the panel's watch-area rows
 * @param {{ id: string, update: object }|null} edit  the area and the fields that changed
 * @returns {object[]} the same array when the edit doesn't apply, so React skips a render
 */
export function applyAreaEdit(areas, edit) {
  if (!edit || !areas.some((a) => a.id === edit.id)) return areas;
  return areas.map((a) => (a.id === edit.id ? { ...a, ...edit.update } : a));
}

/** The panel's cached place lists without the edited area's, so only that one is read again. */
export function withoutZone(zones, id) {
  if (!(id in zones)) return zones;
  const next = { ...zones };
  delete next[id];
  return next;
}
