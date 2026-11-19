---
description: Plan, build, review, verify and learn from one change request, on the working branch
argument-hint: <what to change>
---

Ship this change: $ARGUMENTS

Follow the steps in order. Stop and ask the owner only where a step says so.

**0. Start.** Run `git fetch origin main` and bring the branch up to date with `git merge --ff-only origin/main`. If that fails, stop and ask: the branch has its own unmerged commits.

**1. Plan.** Run the `planner` agent on the request. Show the owner its plan. Then stop and wait for an answer, unless the request starts with "go" or says not to wait.

**2. Build.** Make the change on this branch, following `CLAUDE.md`: one concern per commit, the conventions, the tests it needs, and `npm run format` on the files you changed. Commit as you go with `git add -A` and `git status --short` first. Don't use `git commit -am`.

**3. Review.** Run the `reviewer` agent on `git diff origin/main...HEAD`. Fix each real finding on this branch. For a finding you think is wrong, say why in your report instead of changing the code.

**4. Verify.** Run the `verifier` agent. If a gate fails, fix it on this branch and run the verifier again. Don't report a pass the verifier didn't show.

**5. Learn.** Do this every time, not only when something went wrong. Look at what the reviewer and the verifier found, and at any mistake you made along the way, and ask of each: will this come back?

- If the mistake has a pattern a regular expression can find, add a rule to `checks/rules.mjs` with a test in `checks/rules.test.mjs`. Its `why` names the mistake. If the rule would already flag existing code, fix that code, or excuse the line with `check-allow: <rule-id> <reason>`, in the same commit.
- If it needs judgment, add a line to the "Judgment checks" list at the bottom of `.claude/agents/reviewer.md`.
- Commit this as its own commit, `chore(checks): ...`, after running `npm run check:rules` and `npm test`.
- If nothing new was learned, say so in your report.

**6. Push.** Run `git push -u origin <branch>`, retrying network errors up to four times with backoff. Open a pull request only when the owner asks for one. If a pull request is opened, its body says: what changed and why; what was verified, with the commands and results; what could not be verified; anything the owner must do (SQL to run, settings to change); and a "Learned" line naming each rule or judgment check added, or "nothing new". End it with the attribution footer from the session.

**7. Report.** Tell the owner, in a few lines: pass or fail for each gate, the branch name (and pull request link, if one was opened), what to look at in the screenshots, and what was learned.
