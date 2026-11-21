// Tests for .claude/hooks/guard.mjs. Run by `npm test` from the repo root.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verdict } from "./guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const bash = (command) => verdict({ tool_name: "Bash", tool_input: { command } }, root);
const blocked = (command) => assert.ok(bash(command)?.deny, `should block: ${command}`);
const allowed = (command) => assert.equal(bash(command), null, `should allow: ${command}`);

test("database tools are blocked, also behind wrappers and bash -c", () => {
  blocked("psql $DATABASE_URL");
  blocked("npx supabase db push");
  blocked("FOO=1 sudo pg_dump -t inspections");
  blocked('bash -c "psql -c \\"select 1\\""');
  blocked("sh -c 'supabase functions deploy x'");
  blocked('eval "pg_dump db"');
  blocked("npm ci && psql");
});

test("pipeline scripts are blocked; their tests are not", () => {
  blocked("node pipeline/seed_facilities.js");
  blocked("cd pipeline && node seed_inspections.js");
  blocked("node pipeline/digest/run.js --dry-run");
  blocked("npm run seed:facilities -w pipeline");
  blocked("npm run bullitt:redo --workspace pipeline");
  allowed("npm test -w pipeline");
  allowed("node --test pipeline/tests/*.test.js");
  allowed("node checks/run.mjs");
  allowed("npm run check:rules");
  allowed("npm run build");
});

test("node --check only parses a pipeline file, so it is allowed", () => {
  allowed("node --check pipeline/regions/bullitt/ingest.js");
  allowed("cd pipeline && node -c source_check.js");
  allowed("node --check pipeline/regions/bullitt/ingest.js && echo syntax-ok");
  // Running it after the check is still running it.
  blocked("node --check pipeline/seed_violations.js && node pipeline/seed_violations.js");
});

test("requests to a Supabase host are blocked, the e2e placeholder is not", () => {
  blocked("curl https://abc123.supabase.co/rest/v1/inspections");
  blocked("node -e \"fetch('https://abc123.supabase.co/rest/v1/x')\"");
  allowed("VITE_SUPABASE_URL=https://example.supabase.co npm run build");
  allowed('grep -rn "supabase.co" apps/web/src');
});

test("quoted text and heredoc bodies are data", () => {
  allowed('git commit -m "docs: never run psql or read .env"');
  allowed(
    "git commit -F - <<'EOF'\nchore: block psql\n\nnpm run seed:facilities is the owner's\nEOF",
  );
  allowed('rg "pg_dump" .github');
});

test("secrets files can't be printed or read", () => {
  blocked("cat pipeline/.env");
  blocked("grep KEY apps/web/.env.local");
  allowed("cat apps/web/.env.example");
  const read = (tool, input) => verdict({ tool_name: tool, tool_input: input }, root);
  assert.ok(read("Read", { file_path: "/repo/pipeline/.env" })?.deny);
  assert.ok(read("Grep", { pattern: "KEY", path: "pipeline/.env" })?.deny);
  assert.equal(read("Read", { file_path: "/repo/apps/web/.env.example" }), null);
});

test("Supabase MCP: docs pass, small metadata reads ask, the rest is blocked", () => {
  const mcp = (tool) => verdict({ tool_name: `mcp__Supabase__${tool}`, tool_input: {} }, root);
  assert.equal(mcp("search_docs"), null);
  assert.equal(mcp("get_project_url"), null);
  assert.ok(mcp("list_tables")?.ask);
  assert.ok(mcp("get_advisors")?.ask);
  assert.ok(mcp("execute_sql")?.deny);
  assert.ok(mcp("apply_migration")?.deny);
  assert.ok(mcp("deploy_edge_function")?.deny);
  // The server's name differs between machines.
  assert.ok(verdict({ tool_name: "mcp__supabase__execute_sql", tool_input: {} }, root)?.deny);
  assert.equal(verdict({ tool_name: "mcp__github__get_me", tool_input: {} }, root), null);
});
