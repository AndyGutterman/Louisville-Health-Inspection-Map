// Rules that catch mistakes this repo has already made, so they stop coming back.
//
// Each rule says where its lesson came from (`why`). A new rule arrives in the same
// change as the fix that taught it (see .claude/commands/ship.md), with a test in
// checks/rules.test.mjs. A rule that can't be written as a pattern belongs in the
// reviewer's judgment checks (.claude/agents/reviewer.md) instead.
//
// A rule's check returns findings { line, message }. A line can be excused with a
// comment `check-allow: <rule-id> <reason>` on the same line or the line above (see run.mjs).

const isTest = (file) => /\.test\.(js|jsx|mjs)$/.test(file);
const isWebSource = (file) => file.startsWith("apps/web/src/") && !isTest(file);
const isComment = (line) => /^\s*(\/\/|\/\*|\*)/.test(line);

/** 1-based line number of a character index in `text`. */
function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

/** Findings for every match of `pattern` in `text`. */
function findAll(text, pattern, message) {
  return [...text.matchAll(pattern)].map((m) => ({ line: lineOf(text, m.index), message }));
}

/** The arguments of a call, from its opening parenthesis to the matching close. */
function callText(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return text.slice(openIndex, i + 1);
  }
  return text.slice(openIndex);
}

export const rules = [
  {
    id: "no-broad-style-selectors",
    why: "A selector on [style] matches every inline-styled element. It once forced padding onto every button in the info drawer (CLAUDE.md, Global CSS leaks).",
    applies: (file) => isWebSource(file) && file.endsWith(".css"),
    check(file, text) {
      // Blank out block comments, keeping the line breaks so line numbers stay right.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
      return findAll(
        code,
        /\[style\b/g,
        "Selector on [style] matches every inline-styled element. Give the element a class.",
      );
    },
  },

  {
    id: "supabase-only-in-api",
    why: "Components never query Supabase; every query lives in apps/web/src/api/ (CLAUDE.md, Repo layout).",
    applies: (file) =>
      isWebSource(file) && /\.jsx?$/.test(file) && !file.startsWith("apps/web/src/api/"),
    check(file, text) {
      return findAll(
        text,
        /\bsupabase\.(from|rpc|storage|functions)\b/g,
        "Query Supabase from apps/web/src/api/, not from a component or lib file.",
      );
    },
  },

  {
    id: "no-select-star-in-browser",
    why: "Egress: the free tier allows 5 GB a month, and reading every column of a whole view is the costliest read (CLAUDE.md, Egress).",
    applies: (file) => file.startsWith("apps/web/src/api/") && !isTest(file),
    check(file, text) {
      return findAll(
        text,
        /\.select\(\s*["'`]\*["'`]/g,
        'Name the columns. select("*") reads every column of the table or view.',
      );
    },
  },

  {
    id: "storage-keys-documented",
    why: "docs/PRIVACY.md lists every localStorage key, and the privacy page must stay true (CLAUDE.md, Privacy page). Three keys were missing until this rule ran.",
    applies: (file) => isWebSource(file) && /\.jsx?$/.test(file),
    check(file, text, { read }) {
      const doc = read("docs/PRIVACY.md") ?? "";
      // The doc names families of keys as `lfs_geodata_*`.
      const families = [...doc.matchAll(/(lfs_[a-z0-9_]*)\*/g)].map((m) => m[1]);
      const documented = (key) =>
        doc.includes(key) || families.some((prefix) => key.startsWith(prefix));
      const out = [];
      for (const m of text.matchAll(/["'`](lfs_[a-z0-9_]+)/g)) {
        const key = m[1];
        if (!documented(key)) {
          out.push({
            line: lineOf(text, m.index),
            message: `localStorage key ${key} is not in docs/PRIVACY.md. Add it there, so the privacy page stays true.`,
          });
        }
      }
      return out;
    },
  },

  {
    id: "score-scale-in-one-place",
    why: "The badge scale (95 and up, 85 to 94, under 85) lives in packages/core/grading.js only (CLAUDE.md, Key behaviors). Strings are text, so they are exempt.",
    applies: (file) =>
      isWebSource(file) &&
      /\.jsx?$/.test(file) &&
      !/strings[^/]*\.js$/.test(file) &&
      file !== "apps/web/src/lib/scoring.js",
    check(file, text) {
      const out = [];
      text.split("\n").forEach((line, i) => {
        // A bare 85 or 95, not part of a longer number, a decimal or a negative coordinate.
        if (!isComment(line) && /(?<![\d.-])(85|95)(?![\d.])/.test(line)) {
          out.push({
            line: i + 1,
            message:
              "Score cut-offs come from packages/core/grading.js (FAIL_SCORE, TOP_SCORE). Import them.",
          });
        }
      });
      return out;
    },
  },

  {
    id: "no-addresses-in-digest-logs",
    why: "The email outbox's log is public (the email-outbox workflow). Never print an address (CLAUDE.md, Email admin page).",
    applies: (file) => file.startsWith("pipeline/digest/") && file.endsWith(".js") && !isTest(file),
    check(file, text) {
      const out = [];
      for (const m of text.matchAll(/console\.(log|info|warn|error)\s*\(/g)) {
        const args = callText(text, m.index + m[0].length - 1);
        if (/\b(email|address|addr)\b/i.test(args)) {
          out.push({
            line: lineOf(text, m.index),
            message: "Don't log an address: this log is public. Log a count or an id.",
          });
        }
      }
      return out;
    },
  },
];
