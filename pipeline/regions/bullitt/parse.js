/**
 * regions/bullitt/parse.js — turns the Bullitt County Health Department's inspection
 * sheet into establishments and inspections. Pure: no network, no database.
 *
 * The department publishes one row per establishment in a public Google Sheet (it feeds
 * the drop-down on bullitthealth.org/food). Each row holds only the LATEST inspection:
 *   Establishment Name, Address, City, Last Inspection Score, Violations,
 *   Follow-Up Date, Follow-Up Score, Follow-Up Violations
 * There is no establishment id and no date for the latest inspection, so ids are made
 * from name + address, and history is built by keeping every version of a row we see.
 */
import { createHash } from "node:crypto";

export const ID_PREFIX = "bullitt-";

export const COLUMNS = [
  "Establishment Name",
  "Address",
  "City",
  "Last Inspection Score",
  "Violations",
  "Follow-Up Date",
  "Follow-Up Score",
  "Follow-Up Violations",
];

// RFC 4180 CSV: quoted fields may hold commas, newlines and doubled quotes ("").
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const squish = (s) =>
  String(s ?? "")
    .replace(/\s+/g, " ")
    .trim();

// Spellings seen in the sheet -> one name per town (uppercase, like Louisville's data).
const CITY_ALIASES = {
  SHEPHERDSVILLE: "SHEPHERDSVILLE",
  SHEPHERDSVLLE: "SHEPHERDSVILLE",
  SHEPHERDSVILE: "SHEPHERDSVILLE",
  "MOUNT WASHINGTON": "MOUNT WASHINGTON",
  "MT WASHINGTON": "MOUNT WASHINGTON",
  "LEBANON JCT": "LEBANON JUNCTION",
  "LEBANON JUNCTION": "LEBANON JUNCTION",
};

export function normalizeCity(raw) {
  const city = squish(raw).toUpperCase().replace(/\./g, "");
  return CITY_ALIASES[city] ?? city;
}

/**
 * The violations cell as a list of inspection-form items. The cell separates items with
 * "; ", but some form items contain "; " themselves ("Hot and cold water available;
 * adequate pressure; plumbing maintained"). A piece starting with a lowercase letter
 * continues the item before it; the uppercase ones that contain "; " are listed here.
 */
const UPPERCASE_COMPOUNDS = new Set([
  "PLUMBING INSTALLED; PROPER BACKFLOW DEVICES",
  "PASTEURIZED FOODS USED; PROHIBITED FOODS NOT OFFERED",
  "MANAGEMENT, FOOD EMPLOYEE AND CONDITIONAL EMPLOYEE; KNOWLEDGE, RESPONSIBILITIES AND REPORTING",
]);

export function splitViolations(cell) {
  const items = [];
  for (const piece of String(cell ?? "").split(/\s*;\s*|\r?\n/)) {
    const text = squish(piece);
    if (!text) continue;
    const prev = items.length ? items[items.length - 1] : null;
    if (prev && (/^[a-z]/.test(text) || UPPERCASE_COMPOUNDS.has(`${prev}; ${text}`))) {
      items[items.length - 1] = `${prev}; ${text}`;
    } else items.push(text);
  }
  return items;
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

// Stable id from name + address (the sheet has none). Renaming a place gives it a new id.
export function establishmentId(name, address) {
  const key = `${squish(name).toUpperCase()}|${squish(address).toUpperCase()}`;
  return ID_PREFIX + sha(key).slice(0, 12);
}

// Fingerprint of an inspection's content: a changed score, date or violation list is a
// new inspection.
export function contentHash({ kind, inspection_date, score, violations }) {
  return sha(JSON.stringify([kind, inspection_date ?? null, score ?? null, violations])).slice(
    0,
    16,
  );
}

function inspection(kind, inspection_date, score, violations) {
  if (inspection_date == null && score == null && violations.length === 0) return null;
  const row = { kind, inspection_date, score, violations };
  return { ...row, content_hash: contentHash(row) };
}

/**
 * The sheet's CSV as establishments, each with its latest routine inspection and
 * follow-up (either may be null). Throws if the columns are not the expected ones, so a
 * change to the sheet stops the job instead of loading wrong data.
 * @returns {{ establishments: object[], warnings: string[] }}
 */
export function parseSheet(csvText) {
  const [header, ...rows] = parseCsv(csvText.replace(/^﻿/, ""));
  const got = (header || []).map(squish);
  if (COLUMNS.some((c, i) => got[i]?.toLowerCase() !== c.toLowerCase())) {
    throw new Error(
      `Unexpected columns: ${JSON.stringify(got)}; expected ${JSON.stringify(COLUMNS)}`,
    );
  }

  const warnings = [];
  const byId = new Map();
  rows.forEach((cells, i) => {
    const name = squish(cells[0]);
    if (!name) return;
    const warn = (msg) => warnings.push(`row ${i + 2} (${name}): ${msg}`);
    const address = squish(cells[1]);
    const id = establishmentId(name, address);
    if (byId.has(id)) {
      warn("same name and address as an earlier row; skipped");
      return;
    }
    byId.set(id, {
      id,
      name,
      address,
      city: normalizeCity(cells[2]),
      raw_city: squish(cells[2]),
      routine: inspection("routine", null, parseScore(cells[3], warn), splitViolations(cells[4])),
      follow_up: inspection(
        "follow_up",
        parseUsDate(cells[5], warn),
        parseScore(cells[6], warn),
        splitViolations(cells[7]),
      ),
    });
  });
  return { establishments: [...byId.values()], warnings };
}
