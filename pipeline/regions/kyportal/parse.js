/**
 * regions/kyportal/parse.js — turns one county's page from Kentucky's inspection portal
 * (fetch.js) into establishments and inspections. Pure: no network, no database.
 *
 * The page is a table holding only the LATEST inspection per row:
 *   NAME, ADDRESS, CITY, LAST INSPECTION DATE, LAST INSPECTION SCORE/GRADE,
 *   FOLLOW-UP DATE, FOLLOW-UP SCORE/GRADE
 * A score is a link ("94", sometimes "98/A") whose hover popup lists the inspection form
 * items that were marked, as <li>s. There is no establishment id, so ids are made from
 * name + address, as for Bullitt's sheet (lib/countyRows.js).
 *
 * A place can have several rows: the portal lists it once per kind of inspection the
 * health department does there (a school's cafeteria and its building, a hotel and its
 * pool), with nothing saying which is which. Rows with the same name and address are
 * therefore one establishment with several inspections, never "duplicates" to drop.
 */
import {
  contentHash,
  establishmentId,
  normalizeCity,
  parseUsDate,
  squish,
} from "../../lib/countyRows.js";

export const COLUMNS = [
  "NAME",
  "ADDRESS",
  "CITY",
  "LAST INSPECTION DATE",
  "LAST INSPECTION SCORE/GRADE",
  "FOLLOW-UP DATE",
  "FOLLOW-UP SCORE/GRADE",
];

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'" };
const decode = (s) =>
  String(s ?? "").replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (whole, code) => {
    if (code in ENTITIES) return ENTITIES[code];
    if (/^#x/i.test(code)) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code[0] === "#") return String.fromCodePoint(Number(code.slice(1)));
    return whole;
  });

// A cell's visible text: tags out, entities decoded, whitespace squeezed.
const cellText = (html) => squish(decode(html.replace(/<[^>]*>/g, " ")));

/**
 * "94" -> { score: 94, grade: null }; "98/A" -> { score: 98, grade: "A" }; "" -> neither.
 * Anything else is reported and treated as no score.
 */
export function parseScoreGrade(raw, warn = () => {}) {
  const s = squish(raw);
  if (!s) return { score: null, grade: null };
  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s*\/\s*([A-Za-z]))?$/);
  if (!m) {
    warn(`unreadable score "${s}"`);
    return { score: null, grade: null };
  }
  return { score: Number(m[1]), grade: m[2] ? m[2].toUpperCase() : null };
}

/**
 * A score cell: the link's text, and the marked form items from its hover popup. The
 * popup's HTML sits inside a JavaScript string in the onmouseover attribute, so quotes in
 * it arrive as \' .
 */
export function parseScoreCell(html, warn = () => {}) {
  // The link's text is whatever sits right before </a> (its attributes contain ">").
  const link = html.match(/>([^<>]*)<\/a>/);
  if (!link) return { score: null, grade: null, violations: [] };
  const list = html.match(/<ul>([\s\S]*?)<\/ul>/)?.[1] ?? "";
  const violations = [...list.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((m) => squish(decode(m[1].replace(/\\(['"\\])/g, "$1"))))
    .filter(Boolean);
  return { ...parseScoreGrade(decode(link[1]), warn), violations };
}

function inspection(kind, inspection_date, { score, grade, violations }) {
  if (inspection_date == null && score == null && violations.length === 0) return null;
  const row = { kind, inspection_date, score, violations };
  return { ...row, grade, content_hash: contentHash(row) };
}

// Newest first; undated last; on the same day the follow-up (the later visit) comes first.
const byNewest = (a, b) =>
  (b.inspection_date ?? "").localeCompare(a.inspection_date ?? "") ||
  a.kind.localeCompare(b.kind) ||
  a.content_hash.localeCompare(b.content_hash);

/**
 * One county's page as establishments, each with every inspection the page shows for it,
 * newest first: { kind: "routine" | "follow_up", inspection_date, score, grade,
 * violations, content_hash }. A place not inspected yet has none. Two rows for one place
 * with exactly the same result collapse into one inspection.
 *
 * Throws, so a change to the portal stops the job instead of loading wrong data, when:
 * the table or its count is missing, the columns are not the expected ones, or the page
 * holds fewer rows than the portal says the county has.
 * @param {string} html      the page from fetchCountyPage
 * @param {string} idPrefix  e.g. "oldham-"
 * @returns {{ total: number, establishments: object[], warnings: string[] }}
 */
export function parsePortalPage(html, { idPrefix }) {
  if (!idPrefix) throw new Error("parsePortalPage needs an idPrefix");
  const grid = html.match(/<table id="VW_PUBLIC_EST_INSPTableControlGrid"[\s\S]*?<\/table>/)?.[0];
  if (!grid) throw new Error("The portal page has no inspection table");

  const got = [...grid.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map((m) => cellText(m[1]));
  if (got.length !== COLUMNS.length || COLUMNS.some((c, i) => got[i]?.toUpperCase() !== c)) {
    throw new Error(
      `Unexpected columns: ${JSON.stringify(got)}; expected ${JSON.stringify(COLUMNS)}`,
    );
  }

  const totalText = html.match(/Pagination__TotalItems"[^>]*>\s*([\d,]+)\s*</)?.[1];
  if (!totalText) throw new Error("The portal page doesn't say how many places it has");
  const total = Number(totalText.replace(/,/g, ""));

  const rows = [...grid.matchAll(/<tr>\s*(<td class="ttc"[\s\S]*?)<\/tr>/g)].map((m) =>
    m[1].split(/<td class="ttc"[^>]*>/).slice(1),
  );
  if (rows.length !== total) {
    throw new Error(
      `The page has ${rows.length} rows but the portal says ${total}: more than fits on one page?`,
    );
  }

  const warnings = [];
  const byId = new Map();
  rows.forEach((cells, i) => {
    const name = cellText(cells[0] ?? "");
    if (!name) return;
    const warn = (msg) => warnings.push(`row ${i + 1} (${name}): ${msg}`);
    if (cells.length !== COLUMNS.length) {
      warn(`${cells.length} cells instead of ${COLUMNS.length}; skipped`);
      return;
    }
    const address = cellText(cells[1]);
    const id = establishmentId(name, address, idPrefix);
    const rawCity = cellText(cells[2]);
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name,
        address,
        city: normalizeCity(rawCity),
        raw_city: rawCity,
        inspections: [],
      });
    }
    const place = byId.get(id);
    const found = [
      inspection("routine", parseUsDate(cellText(cells[3]), warn), parseScoreCell(cells[4], warn)),
      inspection(
        "follow_up",
        parseUsDate(cellText(cells[5]), warn),
        parseScoreCell(cells[6], warn),
      ),
    ];
    for (const insp of found) {
      if (!insp) continue;
      const same = (o) => o.kind === insp.kind && o.content_hash === insp.content_hash;
      if (!place.inspections.some(same)) place.inspections.push(insp);
    }
  });
  const establishments = [...byId.values()];
  for (const e of establishments) e.inspections.sort(byNewest);
  return { total, establishments, warnings };
}
