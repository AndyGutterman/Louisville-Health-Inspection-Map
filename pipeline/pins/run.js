/**
 * pins/run.js — the pin-fixes job: geocodes the address fixes made in the pin control
 * center (/?page=pins) and puts the pins it finds on the map (pins/fixJob.js,
 * docs/PINS.md). Started by the page's "Geocode now" button through the pins-dispatch
 * edge function, or by hand in GitHub (Actions, Pin fixes).
 *
 * Usage (from pipeline/):
 *   node pins/run.js
 *
 * The log is public (GitHub Actions): it names places and addresses, which the site
 * publishes anyway, and nothing about the admin who made the fix.
 */
import "dotenv/config";
import { supa } from "../lib/db.js";
import { runFixJob } from "./fixJob.js";

runFixJob(supa).catch((err) => {
  console.error("Pin fixes failed:", err.message);
  process.exit(1);
});
