// Forgiving search: the same words match however they are spaced, punctuated or
// accented. "mcdonalds", "Mc Donald's", "mc'donalds" and "McDONALD’S" all find McDonald's,
// on the map and in Table View, in both counties. Pure: no React, no map.

// Letters and digits only, lowercase, accents dropped: "Mc Donald's" -> "mcdonalds".
export function compact(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// The words of a search, each compacted. Every word must match for a place to match,
// in any order: "mc donalds dixie" finds the McDonald's on Dixie Hwy. A word is split on
// spaces only, so "mc'donalds" stays one word ("mcdonalds").
export function searchTokens(term) {
  return String(term ?? "")
    .split(/\s+/)
    .map(compact)
    .filter(Boolean);
}

// What a place is searched by: each field compacted, kept apart by spaces so a word
// can't match across the end of the name and the start of the address.
export function searchKey(...fields) {
  return fields.map(compact).filter(Boolean).join(" ");
}

// The search key of a map feature: name, addresses and zip.
export function featureSearchKey(p = {}) {
  return searchKey(p.name, p.address_full, p.address, p.zip);
}

// Whether the text matches every word of the term. True for a blank term.
export function matchesSearch(text, term) {
  const key = compact(text);
  return searchTokens(term).every((t) => key.includes(t));
}

// A Postgres regex matching the compacted word with anything but letters and digits
// allowed between its characters: "mcdonalds" -> m[^a-z0-9]*c[^a-z0-9]*d... (used
// case-insensitively). The word is letters and digits only, so nothing needs escaping.
export function looseRegex(token) {
  return [...compact(token)].join("[^a-z0-9]*");
}
