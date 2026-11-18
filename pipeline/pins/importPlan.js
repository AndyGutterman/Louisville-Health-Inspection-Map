/**
 * pins/importPlan.js — which place_fixes rows an overrides.json file becomes
 * (pins/import_json.js). Pure.
 */
import { overrideKeyFor } from "../lib/overrides.js";

/**
 * @param {object} p
 * @param {string} p.region
 * @param {Map} p.entries     parseOverrides(json, { withHidden: true })
 * @param {object[]} p.places { id, name, address, city, state }
 * @param {{city: string, state: string}} p.defaults
 * @param {Set<string>} [p.existing]  place ids that already have a fix (kept as they are)
 * @returns {{ fixes: object[], unmatched: string[] }}  unmatched: entry keys no place has
 */
export function planImport({ region, entries, places, defaults, existing = new Set() }) {
  const used = new Set();
  const fixes = [];
  for (const place of places) {
    const key = overrideKeyFor(entries, place, defaults);
    if (!key) continue;
    used.add(key);
    if (existing.has(place.id)) continue;
    const entry = entries.get(key);
    fixes.push({
      place_id: place.id,
      region,
      action: entry.hidden ? "hide" : "pin",
      lon: entry.hidden ? null : entry.lon,
      lat: entry.hidden ? null : entry.lat,
      note: [entry.note, "(from overrides.json)"].filter(Boolean).join(" "),
      status: "done",
      source_name: place.name,
      source_address: place.address,
      source_city: place.city,
      // Before the JSON pin no geocoder had found the place, so Undo leaves it without one.
      source_lon: null,
      source_lat: null,
      source_provider: null,
    });
  }
  return { fixes, unmatched: [...entries.keys()].filter((k) => !used.has(k)) };
}
