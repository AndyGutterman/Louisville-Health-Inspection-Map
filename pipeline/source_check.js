/**
 * source_check.js — has the city's data changed since the last load? (ingest.yml)
 *
 * Reads nothing from the database. Asks each of the city's layers for its statistics and
 * its last edit time (lib/ingestGate.js says why), compares them with the last load's
 * fingerprint in .ingest-state/state.json (restored from GitHub's Actions cache), and
 * writes `run=true|false` to $GITHUB_OUTPUT for the load steps.
 *
 * When it says run, it writes two files next to the state:
 *   state.json  the attempt (saved to the cache before the load, so it counts toward the cap)
 *   done.json   the new fingerprint (moved over state.json and saved after a successful load)
 *
 * If the city can't be reached the job fails: a red X, and nothing loads.
 *
 * Usage (from pipeline/): node source_check.js   (MANUAL=true always loads)
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LAYERS, decide, fingerprint, statisticsFor } from "./lib/ingestGate.js";

export const STATE_DIR = ".ingest-state";

async function fetchJson(url, tries = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(JSON.stringify(body.error ?? res.status));
      return body;
    } catch (err) {
      if (attempt >= tries) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

const query = (layer) =>
  `${layer.url}/query?where=1%3D1&returnGeometry=false&f=json&outStatistics=${encodeURIComponent(
    statisticsFor(layer),
  )}`;

/**
 * Every layer's statistics and the most recent edit among them (ms, or null).
 * @param {(url: string) => Promise<object>} get
 */
export async function probe(get = fetchJson) {
  const stats = {};
  let newestEdit = null;
  for (const layer of LAYERS) {
    const answer = await get(query(layer));
    stats[layer.name] = answer.features?.[0]?.attributes;
    const info = (await get(`${layer.url}?f=json`)).editingInfo ?? {};
    const edit = info.dataLastEditDate ?? info.lastEditDate;
    if (typeof edit === "number") newestEdit = Math.max(newestEdit ?? 0, edit);
  }
  return { stats, newestEdit };
}

function readState(dir) {
  try {
    return JSON.parse(readFileSync(`${dir}/state.json`, "utf8"));
  } catch {
    return null; // no cache yet (or it was evicted): the next load starts a new one
  }
}

/** The whole check; returns the decision. Everything outside is injectable for tests. */
export async function check({
  get = fetchJson,
  dir = STATE_DIR,
  now = Date.now(),
  manual = false,
  output = process.env.GITHUB_OUTPUT,
  log = console,
} = {}) {
  const state = readState(dir);
  const { stats, newestEdit } = await probe(get);
  const fp = fingerprint(stats);
  const result = decide({ state, fingerprint: fp, now, manual, newestEdit });

  log.log(`City data fingerprint ${fp}; last load's ${state?.fingerprint ?? "(none)"}.`);
  log.log(`${result.run ? "Loading" : "Skipping the load"}: ${result.reason}.`);

  if (result.run) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/state.json`, JSON.stringify(result.attempt));
    writeFileSync(`${dir}/done.json`, JSON.stringify(result.done));
  }
  if (output) appendFileSync(output, `run=${result.run}\n`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  check({ manual: process.env.MANUAL === "true" }).catch((err) => {
    console.error("Source check failed:", err.message);
    process.exit(1);
  });
}
