// The counties Table View can list (lib/regions.js has.table), and their names.
import { enabledRegions } from "../../lib/regions.js";

export const ALL_REGIONS = enabledRegions();
export const TABLE_REGIONS = ALL_REGIONS.filter((r) => r.has.table); // Oldham isn't in the table views yet
export const ALL_IDS = ALL_REGIONS.map((r) => r.id);
export const regionShort = (id) => TABLE_REGIONS.find((r) => r.id === id)?.shortName ?? "";
// "A, B and C" in the visitor's language (t from useT).
export const joinNames = (names, t) =>
  names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} ${t("table.and")} ${names.at(-1)}`;
export const regionName = (id) => TABLE_REGIONS.find((r) => r.id === id)?.name ?? "";
