// Posts the end-to-end results on a pull request, or updates the earlier comment, with
// the screenshots inline. Called by the `report` job in .github/workflows/e2e.yml
// through actions/github-script. Screenshots are read from ./shots (the downloaded
// artifact) and linked from the e2e-screenshots branch (screenshots-branch.sh).
const fs = require("node:fs");
const path = require("node:path");

const MARKER = "<!-- e2e-results -->";
const PROJECTS = [
  { name: "phone", title: "Phone (Pixel 7)", width: 260 },
  { name: "desktop", title: "Desktop (1280×800)", width: 640 },
];

// "03-whats-new-violations.jpg" -> "What's New violations"
function caption(file) {
  const words = file
    .replace(/\.jpg$/, "")
    .replace(/^\d+-/, "")
    .replace(/-/g, " ");
  const text = words.replace(/\bwhats new\b/, "What's New");
  return text[0].toUpperCase() + text.slice(1);
}

function statusLine(outcome) {
  if (outcome === "success") return "✅ passed";
  if (outcome === "failure") return "❌ failed";
  return `⚠️ ${outcome || "did not run"}`;
}

function buildBody({ owner, repo, pr, sha, runUrl, env }) {
  const { OUTCOME, MODE, TARGET_URL, REPORT_URL, SHOTS_FOLDER } = env;
  const target =
    MODE === "preview"
      ? `the [Netlify deploy preview](${TARGET_URL})`
      : "a build made inside the job (no Netlify preview for this commit)";
  const lines = [
    MARKER,
    `### End-to-end tests ${statusLine(OUTCOME)}`,
    "",
    `Commit \`${sha.slice(0, 7)}\`, desktop and phone, against ${target}.`,
    "",
  ];

  const base = `https://raw.githubusercontent.com/${owner}/${repo}/e2e-screenshots/pr-${pr}/${SHOTS_FOLDER}`;
  let shown = 0;
  for (const project of PROJECTS) {
    const dir = path.join("shots", project.name);
    if (!SHOTS_FOLDER || !fs.existsSync(dir)) continue;
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jpg"))
      .sort();
    if (!files.length) continue;
    shown += files.length;
    lines.push(
      `<details open><summary><b>${project.title}</b>: ${files.length} screenshots</summary>`,
      "",
    );
    for (const file of files) {
      const alt = caption(file);
      lines.push(
        `**${alt}**`,
        "",
        `<img src="${base}/${project.name}/${file}" width="${project.width}" alt="${alt}">`,
        "",
      );
    }
    lines.push("</details>", "");
  }
  if (!shown)
    lines.push(
      "No screenshots for this run (the tests didn't get that far, or publishing them failed).",
      "",
    );

  lines.push(
    `- HTML report: ${REPORT_URL ? `[download (zip)](${REPORT_URL})` : "not uploaded"}`,
    `- [Run log](${runUrl})`,
  );
  return lines.join("\n");
}

module.exports = async function postE2eComment({ github, context, env = process.env }) {
  const { owner, repo } = context.repo;
  const pr = context.payload.pull_request.number;
  const body = buildBody({
    owner,
    repo,
    pr,
    sha: context.payload.pull_request.head.sha,
    runUrl: `${context.serverUrl}/${owner}/${repo}/actions/runs/${context.runId}`,
    env,
  });

  const comments = await github.paginate(github.rest.issues.listComments, {
    owner,
    repo,
    issue_number: pr,
    per_page: 100,
  });
  const existing = comments.find((c) => c.user?.type === "Bot" && c.body?.includes(MARKER));
  if (existing) {
    await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
  } else {
    await github.rest.issues.createComment({ owner, repo, issue_number: pr, body });
  }
  return body;
};

module.exports.buildBody = buildBody;
module.exports.caption = caption;
