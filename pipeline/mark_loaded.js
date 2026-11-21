/**
 * mark_loaded.js — the last step of a load that changed something: stamps the county in
 * data_loads (lib/dataLoads.js), so visitors' saved pins are read again.
 *
 * Usage (from pipeline/): node mark_loaded.js jefferson
 */
import { supa } from "./lib/db.js";
import { markLoaded } from "./lib/dataLoads.js";

markLoaded(supa, process.argv[2]).catch((err) => {
  // Never fail the job over the stamp: the load it follows already succeeded.
  console.warn("mark_loaded:", err.message);
});
