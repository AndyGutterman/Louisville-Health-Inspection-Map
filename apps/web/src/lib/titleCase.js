// The city's data writes violation descriptions in capitals; the Learn page shows them in
// title case.

// Convert ALL-CAPS violation descriptions to Title Case for readability
export function toTitleCase(str) {
  if (!str) return str;
  // If the string is not all-caps (mixed case already), leave it alone
  if (str !== str.toUpperCase()) return str;
  const STOP = new Set([
    "a",
    "an",
    "the",
    "and",
    "but",
    "or",
    "for",
    "nor",
    "on",
    "at",
    "to",
    "by",
    "in",
    "of",
    "up",
    "as",
    "is",
    "it",
  ]);
  return str
    .toLowerCase()
    .replace(/\b\w+/g, (word, idx) =>
      idx === 0 || !STOP.has(word) ? word[0].toUpperCase() + word.slice(1) : word,
    );
}
