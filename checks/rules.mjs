// Rules that catch mistakes this repo has already made, so they stop coming back.
//
// Each rule says where its lesson came from (`why`). A new rule arrives in the same
// change as the fix that taught it (see .claude/commands/ship.md), with a test in
// checks/rules.test.mjs. A rule that can't be written as a pattern belongs in the
// reviewer's judgment checks (.claude/agents/reviewer.md) instead.
//
// A rule's check returns findings { line, message }. A line can be excused with a
// comment `check-allow: <rule-id> <reason>` on the same line or the line above (see run.mjs).

import path from "node:path";

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
    why: "A selector on [style] matches every inline-styled element. It once forced padding onto every button in the info drawer (.claude/rules/css.md).",
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
    why: "Components never query Supabase; every query lives in apps/web/src/api/ (CLAUDE.md, the laws).",
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
    why: "Egress: the free tier allows 5 GB a month, and reading every column of a whole view is the costliest read (CLAUDE.md, the laws).",
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
    why: "docs/PRIVACY.md lists every localStorage key, and the privacy page must stay true (.claude/rules/account.md). Three keys were missing until this rule ran.",
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
    why: "The badge scale (95 and up, 85 to 94, under 85) lives in packages/core/grading.js only (CLAUDE.md, the laws). Strings are text, so they are exempt.",
    applies: (file) =>
      isWebSource(file) &&
      /\.jsx?$/.test(file) &&
      !/strings[^/]*\.js$/.test(file) &&
      file !== "apps/web/src/lib/scoring.js",
    check(file, text) {
      const out = [];
      text.split("\n").forEach((line, i) => {
        // A bare 85 or 95: not part of a longer number, a decimal, a negative coordinate,
        // or a CSS length or duration ("95%", "85vh", "95ms").
        if (
          !isComment(line) &&
          /(?<![\d.-])(85|95)(?![\d.]|%|px|r?em|v[hw]|m?s\b|deg)/.test(line)
        ) {
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
    why: "The email outbox's log is public (the email-outbox workflow). Never print an address (.claude/rules/email.md).",
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

  {
    id: "migration-dollar-quotes-close",
    why: "A JavaScript String.replace turned a function's closing $$; into $; while editing 20261203000000_data_loads.sql (in a replacement string, $$ stands for one $), and did it again while this rule was being written. Prettier skips the migrations folder and nothing runs them before the owner does, so a broken body would first fail in the SQL editor.",
    applies: (file) => /^supabase\/migrations\/.+\.sql$/.test(file),
    check(file, text) {
      const out = findAll(
        text,
        /^[ \t]*\$;?[ \t]*$/gm,
        "A lone $ where a function body should close with $$; (a mangled dollar quote).",
      );
      const quotes = [...text.matchAll(/\$\$/g)];
      if (quotes.length % 2) {
        out.push({
          line: lineOf(text, quotes[quotes.length - 1].index),
          message: "An odd number of $$ quotes: a function body is opened and never closed.",
        });
      }
      return out;
    },
  },

  {
    id: "doc-paths-exist",
    why: "CLAUDE.md and the docs are what every agent reads first, and a path that no longer exists sends it looking for code that moved (the keeper's drift check, made automatic).",
    applies: (file) =>
      file === "CLAUDE.md" || file === "README.md" || /^(docs|\.claude)\/.+\.md$/.test(file),
    check(file, text, { files = [] }) {
      // A path may be written relative to its folder (`lib/scoring.js`), so any tracked
      // file that ends with it counts. Bare names and globs are skipped.
      const exists = (p) => files.some((f) => f === p || f.endsWith(`/${p}`));
      const out = [];
      for (const m of text.matchAll(
        /`([\w.-]+\/[\w./-]+\.(?:m?jsx?|ts|css|md|ya?ml|sql|json|html))`/g,
      )) {
        if (!exists(m[1])) {
          out.push({
            line: lineOf(text, m.index),
            message: `${m[1]} is not a file in the repo. Update the path, or drop it if the file is gone.`,
          });
        }
      }
      return out;
    },
  },

  {
    id: "rules-match-files",
    why: "A file in .claude/rules/ loads only when Claude opens a file its paths match. After a rename it silently stops loading, and its lessons with it. One without paths loads in every session and makes CLAUDE.md long again.",
    applies: (file) => /^\.claude\/rules\/.+\.md$/.test(file),
    check(file, text, { files = [] }) {
      const front = text.match(/^---\n([\s\S]*?)\n---/);
      const patterns = front
        ? [...front[1].matchAll(/^\s*-\s*["']?([^"'\n]+?)["']?\s*$/gm)].map((m) => m[1])
        : [];
      if (!front || !/^paths:/m.test(front[1]) || patterns.length === 0) {
        return [
          {
            line: 1,
            message: "Give this rules file a paths: list, or move its text to CLAUDE.md.",
          },
        ];
      }
      const lines = text.split("\n");
      return patterns
        .filter((pattern) => !files.some((f) => path.posix.matchesGlob(f, pattern)))
        .map((pattern) => ({
          line: lines.findIndex((l) => l.includes(pattern)) + 1,
          message: `paths pattern ${pattern} matches no tracked file. Fix it, or this rule never loads.`,
        }));
    },
  },

  {
    id: "claude-md-stays-short",
    why: "CLAUDE.md loads into every session. At 4,700 words it was mostly detail for one area at a time, and its status section was a week stale. Detail goes in .claude/rules/, status in docs/STATUS.md.",
    applies: (file) => file === "CLAUDE.md",
    check(file, text) {
      const MAX_LINES = 140;
      const MAX_WORDS = 2000;
      const lines = text.split("\n").length;
      const words = text.split(/\s+/).filter((w) => /\w/.test(w)).length;
      if (lines <= MAX_LINES && words <= MAX_WORDS) return [];
      return [
        {
          line: 1,
          message: `CLAUDE.md is ${lines} lines and ${words} words (budget ${MAX_LINES} and ${MAX_WORDS}). Move area detail to .claude/rules/ and status to docs/STATUS.md.`,
        },
      ];
    },
  },
];
