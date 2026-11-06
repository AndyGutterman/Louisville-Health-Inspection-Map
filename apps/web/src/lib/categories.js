// Facility categories. A category is a set of (facility type, subtype) pairs
// from the Louisville Metro inspection data.

export const CATEGORY_SPECS = {
  restaurants: { label: "Restaurants", subs: [{ ft: 605, st: 11 }] },
  schools: { label: "Schools", subs: [{ ft: 605, st: 33 }] },
  daycare: { label: "Daycare", subs: [{ ft: 605, st: 31 }] },
  hospitals: { label: "Hospitals & Nursing", subs: [{ ft: 605, st: 32 }] },
  concessions: {
    label: "Concessions",
    subs: [
      { ft: 603, st: 51 },
      { ft: 603, st: 53 },
    ],
  },
  caterers_commissary: {
    label: "Caterers & Commissaries",
    subs: [
      { ft: 605, st: 42 },
      { ft: 605, st: 43 },
    ],
  },
  retail: {
    label: "Retail",
    subs: [
      { ft: 610, st: 61 },
      { ft: 610, st: 62 },
      { ft: 610, st: 63 },
      { ft: 610, st: 64 },
      { ft: 610, st: 65 },
      { ft: 610, st: 73 },
      { ft: 610, st: 212 },
      { ft: 607, st: 54 },
      { ft: 607, st: 55 },
      { ft: 605, st: 54 },
    ],
  },
  unknown: {
    label: "Other / Unknown",
    subs: [
      { ft: 605, st: 36 },
      { ft: 604, st: 16 },
      { ft: 605, st: 52 },
    ],
  },
};

export function classifyCategory(ft, st) {
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    if (key === "unknown") continue;
    if (spec.subs.some((p) => p.ft === ft && p.st === st)) return key;
  }
  return "unknown";
}

export function buildInitialCatToggles() {
  const obj = {};
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    const subs = {};
    for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = true;
    obj[key] = { enabled: true, subs };
  }
  return obj;
}
