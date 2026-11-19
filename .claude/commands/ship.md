---
description: Plan, build, review, verify and learn from one change request, then open the pull request and watch its checks
argument-hint: <what to change> (start with "go" to skip waiting for plan approval)
---

Ship this change: $ARGUMENTS

Follow the steps in order. Stop and ask the owner only where a step says so. Running `/ship` is the owner asking for a pull request.

**0. Start.** Run `git fetch origin main` and bring the branch up to date with `git merge --ff-only origin/main`. If that fails, stop and ask: the branch has its own unmerged commits.

**1. Plan.** Run the `planner` agent on the request. Show the owner its plan. Then stop and wait for an answer, unless the request starts with "go" or says not to wait. Keep the plan's **size** (small, medium, large) for step 3.

**2. Build.** Make the change on this branch, following `CLAUDE.md`: one concern per commit, the conventions, the tests it needs. Write the test first when the change fixes a bug, and watch it fail. The format hook runs Prettier on each file you edit. Commit as you go with `git add -A` and `git status --short` first. Don't use `git commit -am`.

**3. Review.** Give the reviewer the scope (`git diff origin/main...HEAD`) and the request, not your reasoning, so it judges the diff fresh.

- Small: one `reviewer`.
- Medium or large: two `reviewer` agents at once, in one message, one with the lens "correctness and security", the other with "repo rules and egress".

Then check each finding yourself against the code before acting on it. Fix the real ones on this branch. For one you think is wrong, say why in your report instead of changing the code. If a fix was large, run the reviewer once more on the new commits.

**4. Verify.** Run the `verifier` agent. If a gate fails, fix it on this branch and run the verifier again. Don't report a pass the verifier didn't show.

**5. Learn.** Do this every time, not only when something went wrong. Look at what the reviewers and the verifier found, and at any mistake you made along the way, and ask of each: will this come back?

- If the mistake has a pattern a regular expression can find, add a rule to `checks/rules.mjs` with a test in `checks/rules.test.mjs`. Its `why` names the mistake. If the rule would already flag existing code, fix that code, or excuse the line with `check-allow: <rule-id> <reason>`, in the same commit.
- If it needs judgment, add a line to the "Judgment checks" list in `.claude/agents/reviewer.md`.
- If a hook blocked something it shouldn't have, or let through something it should have blocked, fix `.claude/hooks/guard.mjs` and add the case to `guard.test.mjs`.
- Commit this as its own commit, `chore(checks): ...`, after running `npm run check:rules` and `npm test`.
- If nothing new was learned, say so in your report.

**6. Pull request.** Push with `git push -u origin <branch>`, retrying network errors up to four times with backoff. Open a pull request against `main` with the GitHub tools (or the REST call in `CLAUDE.md`). Its body says: what changed and why; what was verified, with the commands and results; what could not be verified; anything the owner must do (SQL to run, settings to change); and a "Learned" line naming each rule, judgment check or guard fix added, or "nothing new". End it with the attribution footer from the session.

**7. Checks.** `ci.yml` and `e2e.yml` run on the pull request, and `e2e.yml` posts one comment with every screenshot.

- In a cloud session, subscribe to the pull request's activity and end your turn; the results wake you. Don't poll or sleep.
- Locally, check `gh api repos/AndyGutterman/Louisville-Health-Inspection-Map/actions/runs?branch=<branch>` once the runs should be done.
- If a check fails, read its log, fix it on the same branch, and push. A flaky test is reported, never skipped.

**8. Report.** Tell the owner, in a few lines: pass or fail for each check, the pull request link, what to look at in the screenshots, and what was learned. Don't merge.
