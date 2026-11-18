// PreToolUse guard (see .claude/settings.json). Stops two things before they happen:
//   - a command that reaches the live Supabase project (the free tier's 5 GB a month
//     of egress has been used up before; see CLAUDE.md), and
//   - a command that prints or copies a local secrets file (.env, .env.local, ...).
// Exit code 2 blocks the call, and the message is shown to Claude. Anything else passes.
import fs from "node:fs";
import path from "node:path";

const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
const block = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(2);
};

// Commands that talk to a database or to Supabase's management API.
const DATABASE_TOOLS = new Set(["supabase", "psql", "pg_dump", "pg_restore"]);
// Commands that print or copy a file's contents.
const READERS = new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "bat",
  "source",
  ".",
  "base64",
  "xxd",
  "cp",
  "scp",
  "sed",
  "awk",
  "tee",
]);
// Words a command can put before the tool name without changing what it does.
const WRAPPERS = new Set(["npx", "sudo", "env", "exec", "time", "nohup"]);
const SECRET_FILE = /^\.env(\.(local|production|development|test))?$/;
const HINT =
  "Use the fixtures in apps/web/e2e/support/ or ask the owner to run it (CLAUDE.md, Egress).";
const SECRET_HINT = "Names are in apps/web/.env.example. The values are the owner's.";

// Splits a command where the shell would: on &&, ||, ; | and new lines.
const segmentsOf = (command) => command.split(/&&|\|\||;|\||\n/);

/** The words of one command, minus env assignments and wrappers, quotes removed. */
function wordsOf(segment) {
  return segment
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^["']|["']$/g, ""))
    .filter((w) => w && !/^\w+=/.test(w) && !WRAPPERS.has(w));
}

function checkBash(command) {
  // Text inside quotes (a commit message, a search pattern) is data, not a command.
  const unquoted = command.replace(/"[^"]*"|'[^']*'/g, '""');
  for (const segment of segmentsOf(unquoted)) {
    const tool = path.basename(wordsOf(segment)[0] ?? "");
    if (DATABASE_TOOLS.has(tool)) {
      block(`Blocked: \`${tool}\` would reach the live database. ${HINT}`);
    }
  }
  // A request is a request even when the URL is quoted, so check the whole command.
  if (/\b(curl|wget|http)\b/.test(unquoted) && /supabase\.(co|com)\b/.test(command)) {
    block(`Blocked: a request to Supabase. ${HINT}`);
  }
  for (const segment of segmentsOf(command)) {
    const words = wordsOf(segment);
    const tool = path.basename(words[0] ?? "");
    if (READERS.has(tool) && words.some((w) => SECRET_FILE.test(path.basename(w)))) {
      block(`Blocked: \`${tool}\` would print a local secrets file. ${SECRET_HINT}`);
    }
  }
}

function checkRead(filePath) {
  if (SECRET_FILE.test(path.basename(filePath ?? ""))) {
    block(`Blocked: a local secrets file. ${SECRET_HINT}`);
  }
}

if (input.tool_name === "Bash") checkBash(input.tool_input?.command ?? "");
if (input.tool_name === "Read") checkRead(input.tool_input?.file_path);
process.exit(0);
