// PostToolUse (Edit, Write, MultiEdit; see .claude/settings.json). Formats the file that was
// just changed with Prettier, as CLAUDE.md asks, so nobody has to remember to run it.
// Files Prettier doesn't handle are skipped. A file Prettier can't parse is reported to Claude.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const file = input.tool_input?.file_path;
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const FORMATTED = /\.(m?jsx?|css|md|json|ya?ml|html)$/;

if (!file || !FORMATTED.test(file) || !fs.existsSync(file)) process.exit(0);

try {
  execFileSync(
    process.execPath,
    [path.join(projectDir, "node_modules/prettier/bin/prettier.cjs"), "--write", file],
    { cwd: projectDir, stdio: "pipe" },
  );
  process.exit(0);
} catch (err) {
  process.stderr.write(`Prettier could not format ${file}:\n${String(err.stderr || err.message)}`);
  process.exit(2);
}
