/**
 * lib/countyRows.js — small pure helpers for counties whose source is a list of places
 * with their latest inspection and no ids: Bullitt's sheet (regions/bullitt/parse.js) and
 * Kentucky's inspection portal (regions/kyportal/parse.js).
 */
import { createHash } from "node:crypto";

export const squish = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

// Spellings seen in the sources -> one name per town (uppercase, like Louisville's data).
const CITY_ALIASES = {
  SHEPHERDSVILLE: "SHEPHERDSVILLE",
  SHEPHERDSVLLE: "SHEPHERDSVILLE",
  SHEPHERDSVILE: "SHEPHERDSVILLE",
  "MOUNT WASHINGTON": "MOUNT WASHINGTON",
  "MT WASHINGTON": "MOUNT WASHINGTON",
  "LEBANON JCT": "LEBANON JUNCTION",
  "LEBANON JUNCTION": "LEBANON JUNCTION",
  LAGRANGE: "LA GRANGE",
  "LA GRANGE": "LA GRANGE",
};

export function normalizeCity(raw) {
  const city = squish(raw).toUpperCase().replace(/\./g, "");
  return CITY_ALIASES[city] ?? city;
}

// "94" -> 94, "" -> null. Anything else is reported and treated as no score.
export function parseScore(raw, warn = () => {}) {
  const s = squish(raw);
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  warn(`unreadable score "${s}"`);
  return null;
}

// "9/14/2026" (or 9/14/26) -> "2026-09-14". Anything else is reported and dropped.
export function parseUsDate(raw, warn = () => {}) {
  const s = squish(raw);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!m) {
    warn(`unreadable date "${s}"`);
    return null;
  }
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const [month, day] = [Number(m[1]), Number(m[2])];
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    warn(`impossible date "${s}"`);
    return null;
  }
  return d.toISOString().slice(0, 10);
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

// Stable id from name + address (these sources have none): `prefix` + 12 hex digits.
// Renaming a place gives it a new id.
export function establishmentId(name, address, prefix) {
  const key = `${squish(name).toUpperCase()}|${squish(address).toUpperCase()}`;
  return prefix + sha(key).slice(0, 12);
}

// Fingerprint of an inspection's content: a changed score, date or violation list is a
// new inspection.
export function contentHash({ kind, inspection_date, score, violations }) {
  return sha(JSON.stringify([kind, inspection_date ?? null, score ?? null, violations])).slice(
    0,
    16,
  );
}
