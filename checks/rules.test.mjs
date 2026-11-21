// Tests for the rules in checks/rules.mjs and the runner in checks/run.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rules } from "./rules.mjs";
import { allowedBy, runRules } from "./run.mjs";

const rule = (id) => rules.find((r) => r.id === id);

/** Findings of one rule on one file's text. */
const check = (id, file, text, read = () => null) =>
  rule(id)
    .check(file, text, { read })
    .map((f) => f.line);

test("no-broad-style-selectors flags [style] selectors, not comments", () => {
  const r = rule("no-broad-style-selectors");
  assert.equal(r.applies("apps/web/src/styles/Map.css"), true);
  assert.deepEqual(
    check("no-broad-style-selectors", "a.css", ".info-drawer [style] { padding: 0 }"),
    [1],
  );
  assert.deepEqual(
    check("no-broad-style-selectors", "a.css", "/* .x [style] once broke it */\n.y { }"),
    [],
  );
  assert.deepEqual(check("no-broad-style-selectors", "a.css", ".ok { color: red }"), []);
});

test("supabase-only-in-api flags queries outside src/api", () => {
  const r = rule("supabase-only-in-api");
  assert.equal(r.applies("apps/web/src/features/saved/Foo.jsx"), true);
  assert.equal(r.applies("apps/web/src/api/watchlist.js"), false);
  assert.equal(r.applies("apps/web/src/features/saved/Foo.test.jsx"), false);
  assert.deepEqual(check("supabase-only-in-api", "Foo.jsx", "x\nsupabase.from('t').select()"), [2]);
  assert.deepEqual(check("supabase-only-in-api", "Foo.jsx", "supabase.auth.signOut()"), []);
});

test("no-select-star-in-browser flags select('*') in the api layer", () => {
  assert.equal(rule("no-select-star-in-browser").applies("apps/web/src/api/x.js"), true);
  assert.equal(rule("no-select-star-in-browser").applies("apps/web/src/lib/x.js"), false);
  assert.deepEqual(check("no-select-star-in-browser", "x.js", 'from("t")\n  .select("*")'), [2]);
  assert.deepEqual(check("no-select-star-in-browser", "x.js", 'from("t").select("id, name")'), []);
  assert.deepEqual(check("no-select-star-in-browser", "x.js", 'from("t").select(`*`)'), [1]);
});

test("storage-keys-documented passes documented keys and families, flags the rest", () => {
  const doc = "| localStorage: `lfs_counties`, `lfs_geodata_*` |";
  const read = (f) => (f === "docs/PRIVACY.md" ? doc : null);
  const text = [
    'const A = "lfs_counties";',
    'const B = "lfs_geodata_v9";',
    'const C = "lfs_secret_thing";',
  ].join("\n");
  assert.deepEqual(check("storage-keys-documented", "apps/web/src/x.js", text, read), [3]);
  assert.equal(rule("storage-keys-documented").applies("apps/web/src/x.test.js"), false);
});

test("score-scale-in-one-place flags 85 and 95, not coordinates, decimals or comments", () => {
  const r = rule("score-scale-in-one-place");
  assert.equal(r.applies("apps/web/src/lib/scoring.js"), false);
  assert.equal(r.applies("apps/web/src/lib/strings.pages.js"), false);
  assert.deepEqual(check("score-scale-in-one-place", "x.jsx", "if (s >= 95) go();"), [1]);
  assert.deepEqual(check("score-scale-in-one-place", "x.jsx", "const c = [-85.75, 38.25];"), []);
  assert.deepEqual(check("score-scale-in-one-place", "x.jsx", "const r = 0.85 * x;"), []);
  assert.deepEqual(check("score-scale-in-one-place", "x.jsx", "// 85 is the line"), []);
  assert.deepEqual(check("score-scale-in-one-place", "x.jsx", "const w = 1850;"), []);
  assert.deepEqual(check("score-scale-in-one-place", "x.jsx", 'style={{ width: "95%" }}'), []);
  assert.deepEqual(check("score-scale-in-one-place", "x.jsx", 'maxHeight: "85vh", t: "95ms"'), []);
});

test("no-addresses-in-digest-logs flags a log call that names an address", () => {
  const r = rule("no-addresses-in-digest-logs");
  assert.equal(r.applies("pipeline/digest/send.js"), true);
  assert.equal(r.applies("packages/core/email/digest.js"), false);
  const bad = "console.log(\n  `sent to ${email}`,\n);";
  assert.deepEqual(check("no-addresses-in-digest-logs", "send.js", bad), [1]);
  assert.deepEqual(
    check("no-addresses-in-digest-logs", "send.js", "console.log(`Sent ${n} emails`)"),
    [],
  );
  assert.deepEqual(
    check("no-addresses-in-digest-logs", "send.js", "console.log(`Sent ${n}.`)"),
    [],
  );
});

test("doc-paths-exist flags paths to files that are gone, allowing relative ones", () => {
  const r = rule("doc-paths-exist");
  assert.equal(r.applies("CLAUDE.md"), true);
  assert.equal(r.applies("docs/BULLITT.md"), true);
  assert.equal(r.applies("apps/web/README.md"), false);
  const files = ["apps/web/src/lib/scoring.js", "pipeline/regions/kyportal/overrides/oldham.json"];
  const text = [
    "See `lib/scoring.js` and `overrides/oldham.json`.",
    "Also `apps/web/src/lib/gone.js`, `foo.js` and `lib/*.js`.",
  ].join("\n");
  const found = r.check("CLAUDE.md", text, { files }).map((f) => f.line);
  assert.deepEqual(found, [2]);
});

test("rules-match-files needs a paths list whose patterns all match a file", () => {
  const r = rule("rules-match-files");
  assert.equal(r.applies(".claude/rules/map.md"), true);
  assert.equal(r.applies(".claude/agents/reviewer.md"), false);
  const files = ["apps/web/src/lib/scoring.js", "apps/web/src/Map.jsx"];
  const good =
    '---\npaths:\n  - "apps/web/src/lib/{scoring,dedupe}.js"\n  - "apps/web/src/*.jsx"\n---\n# Map';
  assert.deepEqual(r.check("x.md", good, { files }), []);
  const renamed =
    '---\npaths:\n  - "apps/web/src/lib/scoring.js"\n  - "apps/web/src/gone/**"\n---\n';
  assert.deepEqual(
    r.check("x.md", renamed, { files }).map((f) => f.line),
    [4],
  );
  assert.deepEqual(
    r.check("x.md", "# No frontmatter", { files }).map((f) => f.line),
    [1],
  );
});

test("claude-md-stays-short flags a CLAUDE.md over its budget", () => {
  const r = rule("claude-md-stays-short");
  assert.deepEqual(r.check("CLAUDE.md", "# Short\n\nFine."), []);
  assert.equal(r.check("CLAUDE.md", "word ".repeat(2500)).length, 1);
  assert.equal(r.check("CLAUDE.md", "x\n".repeat(200)).length, 1);
});

test("allowedBy needs a rule id and a reason of at least 10 characters", () => {
  const r = rule("no-select-star-in-browser");
  const lines = [
    "// check-allow: no-select-star-in-browser the user's own rows, a few dozen",
    '.select("*")',
    "// check-allow: no-select-star-in-browser short",
    '.select("*")',
    '.select("*") // check-allow: some-other-rule long enough reason here',
  ];
  assert.equal(allowedBy(r, lines, 2), true);
  assert.equal(allowedBy(r, lines, 4), false);
  assert.equal(allowedBy(r, lines, 5), false);
});

test("runRules reports problems with file, line and rule, and honours allowances", () => {
  const files = ["apps/web/src/api/a.js", "apps/web/src/api/b.js", "README.md"];
  const texts = {
    "apps/web/src/api/a.js": 'x\n.select("*")',
    "apps/web/src/api/b.js":
      '// check-allow: no-select-star-in-browser the user\'s own rows\n.select("*")',
  };
  const problems = runRules({ files, read: (f) => texts[f] ?? null });
  assert.deepEqual(problems, [
    {
      file: "apps/web/src/api/a.js",
      rule: "no-select-star-in-browser",
      line: 2,
      message: 'Name the columns. select("*") reads every column of the table or view.',
    },
  ]);
});

test("migration-dollar-quotes-close flags a mangled or unclosed function body", () => {
  const r = rule("migration-dollar-quotes-close");
  assert.equal(r.applies("supabase/migrations/20261203000000_data_loads.sql"), true);
  assert.equal(r.applies("pipeline/source_check.js"), false);
  const fn = (close) =>
    ["CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$", "BEGIN", "END;", close, ""].join(
      "\n",
    );
  assert.deepEqual(check("migration-dollar-quotes-close", "m.sql", fn("$$;")), []);
  // What the String.replace did: the closing $$; became $; (line 4), leaving one $$ (line 1).
  assert.deepEqual(check("migration-dollar-quotes-close", "m.sql", fn("$;")), [4, 1]);
  // A dollar amount in a comment is not a quote.
  assert.deepEqual(check("migration-dollar-quotes-close", "m.sql", "-- costs $5\nSELECT 1;\n"), []);
});
