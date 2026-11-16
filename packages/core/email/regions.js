// County names for the emails. apps/web/src/lib/regions.js is the site's registry; this
// short copy stays until that registry moves here too (docs/REFACTOR_PLAN.md, phase 2).
const NAMES = { jefferson: "Jefferson County", bullitt: "Bullitt County" };
export const regionName = (id) => NAMES[id] ?? id;
