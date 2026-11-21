// PreToolUse guard (see .claude/settings.json). Stops these before they happen:
//   - a command or MCP tool that reaches the live Supabase project: the free tier's
//     5 GB a month of egress has been used up before, once by an agent running a loop
//     (CLAUDE.md, the laws). That covers psql/pg_dump/supabase, HTTP requests to
//     *.supabase.co, the pipeline's scripts (they read and write the real project),
//     and the Supabase MCP server's database tools;
//   - a command that prints or copies a local secrets file (.env, .env.local, ...).
// A blocked call exits 2 with the reason on stderr. A Supabase MCP call that only reads
// a little metadata (list_tables, get_advisors, query_logs, ...) asks the person instead.
// Tests: .claude/hooks/guard.test.mjs (run by npm test).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Commands that talk to a database or to Supabase's management API.
const DATABASE_TOOLS = new Set(["supabase", "psql", "pg_dump", "pg_restore", "pg_dumpall"]);
// Commands that print, search or copy a file's contents.
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
  "od",
  "strings",
  "nl",
  "grep",
  "rg",
  "diff",
  "cp",
  "scp",
  "sed",
  "awk",
  "tee",
]);
// Words a command can put before the tool name without changing what it does.
const WRAPPERS = new Set(["npx", "sudo", "env", "exec", "time", "nohup", "command"]);
// Programs that can make an HTTP request from the command line.
const REQUESTERS = new Set([
  "curl",
  "wget",
  "http",
  "https",
  "node",
  "python",
  "python3",
  "deno",
  "bun",
]);
// A real project's host. The placeholder the e2e build uses (example.supabase.co) is fine.
const SUPABASE_HOST = /\b(?!example\.)[\w-]+\.supabase\.(co|com|in)\b/;
const SECRET_FILE = /^\.env(\.(local|production|development|test))?$/;
const SUPABASE_MCP = /^mcp__.*supabase.*__(.+)$/i;
// Supabase MCP tools that touch no data: documentation and project metadata.
const MCP_FREE = new Set([
  "search_docs",
  "list_organizations",
  "get_organization",
  "list_projects",
  "get_project",
  "get_project_url",
  "get_publishable_keys",
  "list_edge_functions",
  "get_edge_function",
  "list_branches",
]);
// Supabase MCP tools that read a little metadata from the database: the person decides.
const MCP_ASK = new Set([
  "list_tables",
  "list_extensions",
  "list_migrations",
  "get_advisors",
  "query_logs",
  "generate_typescript_types",
]);

const HINT =
  "Use the fixtures in apps/web/e2e/support/ or ask the owner to run it (CLAUDE.md, the laws).";
const SECRET_HINT = "Names are in apps/web/.env.example. The values are the owner's.";

// Splits a command where the shell would: on &&, ||, ; | and new lines.
const segmentsOf = (command) => command.split(/&&|\|\||;|\||\n/);
const stripQuotes = (command) => command.replace(/"[^"]*"|'[^']*'/g, '""');
// A heredoc's body (a commit message, a file being written) is data too.
const stripHeredocs = (command) =>
  command.replace(/<<-?\s*(["']?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, (m) => m.split("\n")[0]);

/** The words of one command, minus env assignments and wrappers, quotes removed. */
function wordsOf(segment) {
  return segment
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/^[("']+|[)"']+$/g, ""))
    .filter((w) => w && !/^\w+=/.test(w) && !WRAPPERS.has(w));
}

/** Pipeline scripts other than the tests: they all reach the real project. */
function pipelineScripts(projectDir) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectDir, "pipeline/package.json"), "utf8"));
    return new Set(Object.keys(pkg.scripts ?? {}).filter((name) => !name.startsWith("test")));
  } catch {
    return new Set();
  }
}

/** True when `node <args>` would run a pipeline file that isn't a test. */
function runsPipelineFile(args, projectDir) {
  if (args.includes("--test")) return false;
  // `node --check` (or -c) only parses the file; nothing runs. Blocking it once left a
  // pipeline edit unchecked for syntax (lint covers only the website).
  if (args.includes("--check") || args.includes("-c")) return false;
  const script = args.find((a) => !a.startsWith("-"));
  if (!script) return false;
  const pipelineDir = path.join(projectDir, "pipeline");
  const testsDir = path.join(pipelineDir, "tests");
  return [path.resolve(projectDir, script), path.resolve(pipelineDir, script)].some(
    (file) =>
      file.startsWith(pipelineDir + path.sep) &&
      !file.startsWith(testsDir + path.sep) &&
      fs.existsSync(file),
  );
}

/** Why a shell command must not run, or null. */
export function checkBash(command, projectDir) {
  // `bash -c "..."` and `eval "..."` run the quoted text, so check that text too.
  for (const m of command.matchAll(/\b(?:(?:ba|z|da)?sh\s+-\w*c\w*|eval)\s+(["'])([\s\S]*?)\1/g)) {
    const inner = checkBash(m[2], projectDir);
    if (inner) return inner;
  }
  command = stripHeredocs(command);
  // Text inside quotes (a commit message, a search pattern) is data, not a command.
  const unquoted = stripQuotes(command);
  const scripts = pipelineScripts(projectDir);
  for (const segment of segmentsOf(unquoted)) {
    const words = wordsOf(segment);
    const tool = path.basename(words[0] ?? "");
    if (DATABASE_TOOLS.has(tool)) {
      return `Blocked: \`${tool}\` would reach the live database. ${HINT}`;
    }
    if (tool === "node" && runsPipelineFile(words.slice(1), projectDir)) {
      return `Blocked: pipeline scripts read and write the live Supabase project. ${HINT}`;
    }
    if (tool === "npm") {
      const run = words.findIndex((w) => w === "run" || w === "run-script");
      const name = run >= 0 ? words.slice(run + 1).find((w) => !w.startsWith("-")) : null;
      if (name && scripts.has(name)) {
        return `Blocked: \`npm run ${name}\` is a pipeline job against the live project. ${HINT}`;
      }
    }
  }
  for (const segment of segmentsOf(command)) {
    const words = wordsOf(segment);
    const tool = path.basename(words[0] ?? "");
    // A request is a request even when the URL is quoted, so look at the whole segment.
    if (REQUESTERS.has(tool) && SUPABASE_HOST.test(segment)) {
      return `Blocked: a request to Supabase. ${HINT}`;
    }
    if (READERS.has(tool) && words.some((w) => SECRET_FILE.test(path.basename(w)))) {
      return `Blocked: \`${tool}\` would print a local secrets file. ${SECRET_HINT}`;
    }
  }
  return null;
}

/**
 * What to do with one tool call: null (let it run), { deny: reason } or { ask: reason }.
 * `input` is the hook's JSON: { tool_name, tool_input }.
 */
export function verdict(input, projectDir = process.cwd()) {
  const name = input.tool_name ?? "";
  const args = input.tool_input ?? {};
  if (name === "Bash") {
    const reason = checkBash(args.command ?? "", projectDir);
    return reason ? { deny: reason } : null;
  }
  if (name === "Read" || name === "Grep") {
    const file = args.file_path ?? args.path ?? "";
    return SECRET_FILE.test(path.basename(file))
      ? { deny: `Blocked: a local secrets file. ${SECRET_HINT}` }
      : null;
  }
  const mcp = name.match(SUPABASE_MCP);
  if (mcp) {
    const tool = mcp[1];
    if (MCP_FREE.has(tool)) return null;
    if (MCP_ASK.has(tool)) {
      return {
        ask: `Supabase ${tool} reads from the live project (5 GB/month egress, CLAUDE.md). Allow only if the owner wants it.`,
      };
    }
    return {
      deny: `Blocked: Supabase ${tool} reads or changes the live project. Write a migration in supabase/migrations/ or give the owner the SQL to run (CLAUDE.md). To allow it, edit .claude/hooks/guard.mjs.`,
    };
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  const result = verdict(input, process.env.CLAUDE_PROJECT_DIR || process.cwd());
  if (result?.deny) {
    process.stderr.write(`${result.deny}\n`);
    process.exit(2);
  }
  if (result?.ask) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: result.ask,
        },
      }),
    );
  }
  process.exit(0);
}
