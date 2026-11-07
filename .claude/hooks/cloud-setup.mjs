// SessionStart hook (see .claude/settings.json). In Claude Code cloud sessions only:
//   1. installs the workspace's npm dependencies, skipped when package-lock.json is
//      unchanged since the last install, so lint, tests, build and e2e work right away;
//   2. checks that the map's basemap host is reachable, because the e2e tests need it.
// Whatever it prints is added to Claude's context. On your own machine it does nothing.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";

if (process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);
process.chdir(process.env.CLAUDE_PROJECT_DIR || process.cwd());

const lines = [];
const stamp = "node_modules/.cloud-setup-lock-sha256";
const lockHash = createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex");

if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === lockHash) {
  lines.push("Dependencies already installed (package-lock.json unchanged).");
} else {
  try {
    execSync("npm ci --no-audit --no-fund", { stdio: "pipe" });
    fs.writeFileSync(stamp, lockHash);
    lines.push("Installed dependencies with npm ci.");
  } catch (err) {
    const tail = String(err.stderr || err.message)
      .trim()
      .split("\n")
      .slice(-5)
      .join("\n");
    lines.push(`npm ci failed; run it again to see the full error. Last lines:\n${tail}`);
  }
}

try {
  const res = await fetch("https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json", {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  lines.push("Map basemap (*.cartocdn.com) is reachable, so `npm run e2e` can run here.");
} catch (err) {
  lines.push(
    `Map basemap (*.cartocdn.com) is NOT reachable (${err.message}). \`npm run e2e\` will fail ` +
      "its load test here. Tell the owner to allow *.cartocdn.com in this cloud environment's " +
      "network access (Custom, with the default domains included). The e2e workflow on the PR " +
      "still runs the tests either way.",
  );
}

console.log(`Cloud setup:\n- ${lines.join("\n- ")}`);
