// Full-page screenshots of key states, for reviewing a change without running it.
// Saved to e2e/screenshots/<project>/<name>.png (gitignored; uploaded by the e2e
// workflow) and attached to the HTML report next to the test that took them.
import path from "node:path";

export async function snap(page, testInfo, name) {
  const file = path.join(
    testInfo.project.testDir,
    "screenshots",
    testInfo.project.name,
    `${name}.png`,
  );
  await page.screenshot({ path: file, fullPage: true });
  await testInfo.attach(name, { path: file, contentType: "image/png" });
}
