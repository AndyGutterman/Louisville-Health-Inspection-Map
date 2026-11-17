// The counties Table View can list (lib/regions.js has.table), and their names.
import { enabledRegions } from "../../lib/regions.js";

export const ALL_REGIONS = enabledRegions();
export const TABLE_REGIONS = ALL_REGIONS.filter((r) => r.has.table); // Oldham isn't in the table views yet
export const ALL_IDS = ALL_REGIONS.map((r) => r.id);
export const regionShort = (id) => TABLE_REGIONS.find((r) => r.id === id)?.shortName ?? "";
export const regionName = (id) => TABLE_REGIONS.find((r) => r.id === id)?.name ?? "";
