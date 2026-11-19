#!/usr/bin/env node
// Runs the rules in checks/rules.mjs over the files git tracks. Exits 1 if any rule fails.
//
// To excuse one line, put `check-allow: <rule-id> <reason>` on that line or the line above.
// The reason must be at least 10 characters, so an exception always says why it exists.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { rules } from "./rules.mjs";

/** True when the line, or the one above it, excuses this rule. */
export function allowedBy(rule, lines, lineNo) {
  const excuse = new RegExp(`check-allow:\\s*${rule.id}\\s+.{10,}`);
  return [lines[lineNo - 1], lines[lineNo - 2]].some((line) => line && excuse.test(line));
}

/**
 * Runs every applicable rule over `files`.
 * `read(file)` returns the file's text, or null when it can't be read.
 * Returns the problems as { file, rule, line, message }.
 */
export function runRules({ files, read, rules: ruleList = rules }) {
  const problems = [];
  for (const file of files) {
    const applicable = ruleList.filter((rule) => rule.applies(file));
    if (applicable.length === 0) continue;
    const text = read(file);
    if (text === null) continue;
    const lines = text.split("\n");
    for (const rule of applicable) {
      for (const found of rule.check(file, text, { read, files })) {
        if (!allowedBy(rule, lines, found.line)) {
          problems.push({ file, rule: rule.id, line: found.line, message: found.message });
        }
      }
    }
  }
  return problems;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = runRules({ files: trackedFiles(), read: readText });
  for (const p of problems) {
    console.log(`${p.file}:${p.line}  ${p.rule}  ${p.message}`);
  }
  if (problems.length) {
    console.log(`\n${problems.length} problem(s). Each rule's "why" is in checks/rules.mjs.`);
    process.exit(1);
  }
  console.log(`All ${rules.length} rules pass.`);
}
