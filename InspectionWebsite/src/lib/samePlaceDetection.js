import {
  COORD_SNAP,
  SAME_PLACE_MAX_M,
  SAME_PLACE_MIN_SIM,
  DEPT_WORDS,
} from "./constants.js";

export function snapCoordKey([lon, lat]) {
  const slon = (Math.round(lon / COORD_SNAP) * COORD_SNAP).toFixed(4);
  const slat = (Math.round(lat / COORD_SNAP) * COORD_SNAP).toFixed(4);
  return `${slon}|${slat}`;
}

export function distanceM([lon1, lat1], [lon2, lat2]) {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractLocationNumber(name) {
  const m = name.match(/#\s*(\d+)/);
  return m ? m[1] : null;
}

function isSubTenant(name) {
  return /@|at|inside|within/i.test(name);
}

function normalizeName(name) {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/#\s*\d+|no\.?\s*\d+|\bunit\s+\w+|\bstore\s+\d+/gi, "")
    .replace(/[''\'']s?\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function tokensMatch(a, b) {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (Math.max(a.length, b.length) >= 6 && editDistance(a, b) <= 1) return true;
  return false;
}

export function nameSimilarity(a, b) {
  if (isSubTenant(a) || isSubTenant(b)) return 0;
  const numA = extractLocationNumber(a);
  const numB = extractLocationNumber(b);
  if (numA !== null && numB !== null && numA !== numB) return 0;
  const ta = normalizeName(a);
  const tb = normalizeName(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta), setB = new Set(tb);
  const extraTokens = [...ta.filter(w => !setB.has(w)), ...tb.filter(w => !setA.has(w))];
  if (extraTokens.length > 0 && extraTokens.every(w => DEPT_WORDS.has(w))) return 0;
  let matched = 0;
  const usedB = new Set();
  for (const wa of ta)
    for (let bi = 0; bi < tb.length; bi++)
      if (!usedB.has(bi) && tokensMatch(wa, tb[bi])) { matched++; usedB.add(bi); break; }
  const jaccard = matched / (ta.length + tb.length - matched);
  const shorter = Math.min(ta.length, tb.length);
  const containment = matched / shorter;
  const lr = Math.max(ta.length, tb.length) / shorter;
  return lr >= 1.5 ? Math.max(jaccard, containment * 0.85) : jaccard;
}

// Tags nearby similar-name features with each other's eid+name.
// All features remain fully independent — no suppression, no history merging.
export function tagSimilarNearby(features) {
  const bySnap = new Map();
  for (const f of features) {
    const k = snapCoordKey(f.geometry.coordinates);
    if (!bySnap.has(k)) bySnap.set(k, []);
    bySnap.get(k).push(f);
  }

  const similarMap = new Map();

  for (const group of bySnap.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (distanceM(a.geometry.coordinates, b.geometry.coordinates) > SAME_PLACE_MAX_M) continue;
        const sim = nameSimilarity(a.properties.name, b.properties.name);
        if (sim < SAME_PLACE_MIN_SIM) continue;
        const eidA = a.properties.establishment_id;
        const eidB = b.properties.establishment_id;
        if (!similarMap.has(eidA)) similarMap.set(eidA, []);
        if (!similarMap.has(eidB)) similarMap.set(eidB, []);
        similarMap.get(eidA).push({ eid: eidB, name: b.properties.name });
        similarMap.get(eidB).push({ eid: eidA, name: a.properties.name });
        if (import.meta.env?.DEV) {
          console.log(
            `[similar-nearby] "${a.properties.name}" (${eidA}) <-> ` +
            `"${b.properties.name}" (${eidB})  sim=${sim.toFixed(2)}`
          );
        }
      }
    }
  }

  if (similarMap.size === 0) return features;
  return features.map((f) => {
    const eid = f.properties.establishment_id;
    if (!similarMap.has(eid)) return f;
    return {
      ...f,
      properties: {
        ...f.properties,
        similar_nearby: JSON.stringify(similarMap.get(eid)),
      },
    };
  });
}
