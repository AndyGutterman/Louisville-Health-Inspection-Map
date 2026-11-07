// Full-page screenshots of key states, for reviewing a change without running it.
// Saved to e2e/screenshots/<project>/<name>.jpg (gitignored; the e2e workflow shows
// them in the PR comment) and attached to the HTML report next to the test.
// JPEG at quality 80 is about a tenth the size of PNG and text stays readable.
import path from "node:path";

export async function snap(page, testInfo, name) {
  const file = path.join(
    testInfo.project.testDir,
    "screenshots",
    testInfo.project.name,
    `${name}.jpg`,
  );
  await page.screenshot({ path: file, fullPage: true, type: "jpeg", quality: 80 });
  await testInfo.attach(name, { path: file, contentType: "image/jpeg" });
}
