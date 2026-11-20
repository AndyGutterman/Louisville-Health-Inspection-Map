/**
 * lib/facilityRows.js — the rows overlay_geometry.js writes to `facilities` from
 * Louisville Metro's FoodServiceData. Pure.
 *
 * Three rules keep a pin from being lost on the daily run:
 *   - Only `geom` carries a location: `lon` and `lat` are generated from it, and the
 *     database refuses a value for them.
 *   - A place pinned or hidden by hand in the pin control center (lib/placeFixes.js) gets
 *     neither `geom` nor `loc_source`, so the overlay never moves or relabels it.
 *   - A bulk upsert writes NULL for every column some row in the batch has and another
 *     lacks, so rows with a point and rows without go in separate batches (batchesByKeys).
 *     Otherwise a place with no point in this load would lose the one it has.
 */

export const normId = (v) => {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/,/g, "").trim(), 10);
  return Number.isFinite(n) ? String(n) : null;
};

/**
 * One FoodServiceData record (attributes, plus _lon/_lat when it has a geometry) -> a
 * facilities row, or null without a usable id.
 * @param {Set<string>} byHand  ids pinned or hidden by hand
 */
export function overlayRow(a, byHand = new Set()) {
  const eid = normId(a.EstablishmentID);
  if (!eid) return null;
  const row = {
    establishment_id: eid,
    permit_number: eid,
    name: a.EstablishmentName || null,
    address: a.Address || null,
    city: a.City || null,
    state: a.State || null,
    zip: a.Zip != null ? String(a.Zip) : null,
  };
  if (byHand.has(eid)) return row;
  row.loc_source = "legacy";
  if (a._lon != null && a._lat != null) row.geom = `SRID=4326;POINT(${a._lon} ${a._lat})`;
  return row;
}

/** Rows -> batches of at most `size`, each holding rows with the same columns. */
export function batchesByKeys(rows, size) {
  const groups = new Map();
  for (const row of rows) {
    const keys = Object.keys(row).sort().join(",");
    if (!groups.has(keys)) groups.set(keys, []);
    groups.get(keys).push(row);
  }
  const batches = [];
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += size) batches.push(group.slice(i, i + size));
  }
  return batches;
}
