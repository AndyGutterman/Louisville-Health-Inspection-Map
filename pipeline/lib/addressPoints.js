/**
 * lib/addressPoints.js — match a street address to 911 address points.
 *
 * A 911 address point is one point per addressed building, kept by the county's
 * addressing authority, so it knows new subdivisions long before OpenStreetMap or the
 * Census do. lib/ky911.js downloads Kentucky's; this file is pure: points in,
 * coordinates out.
 *
 * Inspection data spells streets loosely ("HIGH POINTE CT" for High Point Court,
 * "HISTORIC TRAIL" for Historical Trail), so street names are compared by edit distance.
 * Guards that keep a loose match from landing on the wrong street:
 *   - Only the closest street name(s) count, and they must start with the same letter.
 *   - A looser match is accepted only when that street has the exact house number.
 *   - Otherwise the match must be close and in the same town (or on a street the 911 data
 *     gives no town, as most of Oldham County's); the pin then goes between the
 *     neighbouring house numbers and is marked approximate.
 * Highways are written many ways ("W. HWY 146", "KY 146", 911's "West STATE HIGHWAY 146"),
 * so they are compared as plain HIGHWAY <number>. One written without its direction
 * ("2401 HWY 146") is matched when exactly one direction of that highway has the number.
 */

// Abbreviations -> the full words 911 data uses. Applied to both sides.
const EXPAND = {
  N: "NORTH",
  S: "SOUTH",
  E: "EAST",
  W: "WEST",
  AV: "AVENUE",
  AVE: "AVENUE",
  BND: "BEND",
  BLVD: "BOULEVARD",
  CIR: "CIRCLE",
  CT: "COURT",
  CRT: "COURT",
  CV: "COVE",
  CRST: "CREST",
  XING: "CROSSING",
  DR: "DRIVE",
  FLS: "FALLS",
  HWY: "HIGHWAY",
  HOLW: "HOLLOW",
  LN: "LANE",
  MT: "MOUNT",
  PKWY: "PARKWAY",
  PL: "PLACE",
  PT: "POINT",
  RDG: "RIDGE",
  RD: "ROAD",
  SQ: "SQUARE",
  ST: "STREET",
  TR: "TRAIL",
  TRL: "TRAIL",
  TRC: "TRACE",
  TRCE: "TRACE",
};

// Street types that can end a street name (Kentucky's 911 St_PosTyp values).
const TYPES = new Set(
  "AVENUE BEND BOULEVARD CIRCLE COURT COVE CREST CROSSING DRIVE FALLS HIGHWAY HOLLOW LANE LOOP PARKWAY PASS PLACE POINT RIDGE ROAD RUN SQUARE STREET TRACE TRAIL WAY".split(
    " ",
  ),
);

// Accept a street this far off (edit distance / length) when it has the exact number...
const MAX_RATIO_EXACT = 0.3;
// ...and this far off when the pin goes between neighbouring numbers.
const MAX_RATIO_APPROX = 0.2;
// Neighbouring numbers further apart than this on the ground are not used.
const MAX_SPAN_KM = 1.5;
// With a neighbour on one side only, use it if the numbers are this close.
const MAX_ONE_SIDED_GAP = 50;

const DIRECTIONS = ["NORTH", "SOUTH", "EAST", "WEST"];
const isNumber = (t) => /^\d+$/.test(t ?? "");

// "STATE HIGHWAY", "UNITED STATES HIGHWAY", "US HIGHWAY", "KY HIGHWAY", and "US"/"KY"
// before a number, all as HIGHWAY: 911 data and inspection records name the same road
// differently.
function plainHighways(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const [t, next, after] = [tokens[i], tokens[i + 1], tokens[i + 2]];
    if (t === "STATE" && next === "HIGHWAY") i += 1;
    else if (t === "UNITED" && next === "STATES" && after === "HIGHWAY") i += 2;
    else if ((t === "US" || t === "KY") && next === "HIGHWAY") i += 1;
    else if (!((t === "US" || t === "KY") && isNumber(next))) {
      out.push(t);
      continue;
    }
    out.push("HIGHWAY");
  }
  return out;
}

// "High Pointe Ct." -> ["HIGH", "POINTE", "COURT"]. "ST" first is Saint, not Street.
export function streetTokens(text) {
  const raw = String(text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return plainHighways(raw.map((t, i) => (t === "ST" && i === 0 ? t : (EXPAND[t] ?? t))));
}

export const normalizeTown = (town) => streetTokens(town).join(" ");

// "149 HIGH POINTE CT STE 2" -> { number: 149, tokens: [...] }. No house number -> null.
export function parseStreetAddress(address) {
  const m = String(address || "")
    .trim()
    .match(/^(\d+)[A-Z]?\s+(.+)$/i);
  if (!m) return null;
  const tokens = streetTokens(m[2]);
  return tokens.length ? { number: Number(m[1]), tokens } : null;
}

// Split tokens into the name part and a trailing street type.
function splitType(tokens) {
  const last = tokens.at(-1);
  return tokens.length > 1 && TYPES.has(last)
    ? { name: tokens.slice(0, -1).join(""), type: last }
    : { name: tokens.join(""), type: null };
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Group points by street and town.
 * point: { number, preMod, preDir, preType, name, postType, postDir, town, lon, lat }
 */
export function buildStreetIndex(points) {
  const streets = new Map();
  for (const p of points) {
    if (!Number.isFinite(p.number) || !Number.isFinite(p.lon) || !Number.isFinite(p.lat)) continue;
    const nameTokens = streetTokens(
      [p.preMod, p.preDir, p.preType, p.name, p.postDir].filter(Boolean).join(" "),
    );
    const type = p.postType ? streetTokens(p.postType).join(" ") : null;
    const town = normalizeTown(p.town);
    const label = [...nameTokens, type].filter(Boolean).join(" ");
    const key = `${label}|${town}`;
    if (!streets.has(key)) {
      streets.set(key, {
        label,
        town,
        name: nameTokens.join(""),
        type,
        full: [...nameTokens, type].filter(Boolean).join(""),
        byNumber: new Map(),
      });
    }
    const s = streets.get(key);
    if (!s.byNumber.has(p.number)) s.byNumber.set(p.number, { lon: p.lon, lat: p.lat });
  }
  for (const s of streets.values()) {
    s.numbers = [...s.byNumber.keys()].sort((a, b) => a - b);
  }
  return [...streets.values()];
}

// Edit distance between our street and an indexed one, allowing for a missing or
// different street type ("BOXWOOD RUN RD" vs Boxwood Run, "ERIN COURT" vs Erin Circle).
function streetDistance(ours, s) {
  const typeDiff = ours.type && s.type && ours.type !== s.type ? 1 : 0;
  return Math.min(
    levenshtein(ours.full, s.full),
    levenshtein(ours.name, s.name) + typeDiff,
    levenshtein(ours.name, s.full) + 1,
    levenshtein(ours.full, s.name) + 1,
  );
}

const kmBetween = (a, b) => {
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const dy = (a.lat - b.lat) * 110.57;
  return Math.hypot(dx, dy);
};

// A number with no point of its own: between its neighbours on the street, preferring
// the same side (odd or even). Null when the neighbours are too far apart.
export function interpolate(street, n) {
  const pick = (sameSide) => {
    const ok = (x) => !sameSide || x % 2 === n % 2;
    const lo = [...street.numbers].reverse().find((x) => x < n && ok(x));
    const hi = street.numbers.find((x) => x > n && ok(x));
    return { lo, hi };
  };
  let { lo, hi } = pick(true);
  if (lo == null || hi == null) ({ lo, hi } = pick(false));
  if (lo != null && hi != null) {
    const a = street.byNumber.get(lo);
    const b = street.byNumber.get(hi);
    if (kmBetween(a, b) > MAX_SPAN_KM) return null;
    const t = (n - lo) / (hi - lo);
    return {
      lon: a.lon + (b.lon - a.lon) * t,
      lat: a.lat + (b.lat - a.lat) * t,
      method: `between ${lo} and ${hi}`,
    };
  }
  const near = lo ?? hi;
  if (near != null && Math.abs(near - n) <= MAX_ONE_SIDED_GAP) {
    return { ...street.byNumber.get(near), method: `next to ${near}` };
  }
  return null;
}

/**
 * The best point for { address, city }, or null.
 * Returns { lon, lat, provider: "ky911" | "ky911-approx", confidence, raw }.
 */
export function matchAddress(streets, { address, city }) {
  const parsed = parseStreetAddress(address);
  if (!parsed) return null;
  const { number, tokens } = parsed;
  const ours = { ...splitType(tokens), full: tokens.join("") };
  const town = normalizeTown(city);

  const candidates = streets
    .map((s) => {
      const d = streetDistance(ours, s);
      return {
        s,
        d,
        ratio: d / Math.max(ours.full.length, s.full.length),
        // A street with no town in the 911 data could be in any.
        sameTown: s.town === town || !s.town,
        hasNumber: s.byNumber.has(number),
      };
    })
    .filter((c) => c.ratio <= MAX_RATIO_EXACT && c.s.name[0] === ours.name[0])
    .sort((a, b) => a.d - b.d || b.sameTown - a.sameTown || b.hasNumber - a.hasNumber);
  // Only the closest street name counts: "130 HOPE ST" must not jump to a Rope Street
  // because 130 exists there and not on Hope Street.
  const closest = candidates.filter((c) => c.d === candidates[0]?.d);

  const result = (c, point, method, approx) => ({
    lon: point.lon,
    lat: point.lat,
    provider: approx ? "ky911-approx" : "ky911",
    confidence: approx ? 0.5 : 1,
    raw: { matched: `${number} ${c.s.label}`, town: c.s.town, method },
  });

  const exact = closest.find((c) => c.hasNumber);
  if (exact) return result(exact, exact.s.byNumber.get(number), "exact", false);

  for (const c of closest) {
    if (c.ratio > MAX_RATIO_APPROX || !c.sameTown) continue;
    const point = interpolate(c.s, number);
    if (point) return result(c, point, point.method, true);
  }
  return withoutDirection(streets, number, tokens, result);
}

// "2401 HWY 146" when the 911 data has West and East State Highway 146: the one direction
// with that exact number, or null when none or several have it.
function withoutDirection(streets, number, tokens, result) {
  if (DIRECTIONS.includes(tokens[0])) return null;
  const labels = new Set(DIRECTIONS.map((d) => [d, ...tokens].join(" ")));
  const found = streets.filter((s) => labels.has(s.label) && s.byNumber.has(number));
  if (new Set(found.map((s) => s.label)).size !== 1) return null;
  const s = found[0];
  return result({ s }, s.byNumber.get(number), "exact, direction from the 911 data", false);
}
