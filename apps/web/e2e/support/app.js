// Shared steps for the smoke tests: load the app with mocked data and open things.
import { expect } from "@playwright/test";
import { mockSupabase } from "./mockSupabase.js";

// Loads the map page with Supabase mocked and waits until the splash screen is gone
// (it waits for the map to finish loading). Returns what the page logged as errors.
export async function openApp(page) {
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`Uncaught: ${err.message}`));

  const mock = await mockSupabase(page);
  await page.goto("/");
  await expect(page.getByTestId("splash-screen")).toHaveCount(0, { timeout: 20_000 });
  return { consoleErrors, unmocked: mock.unmocked };
}

export async function openWhatsNew(page) {
  await page.getByRole("button", { name: "What's New", exact: true }).click();
  const panel = page.getByTestId("whats-new-panel");
  await expect(panel).toBeVisible();
  return panel;
}

export const whatsNewRow = (page, eid) =>
  page.locator(`[data-testid="whats-new-row"][data-eid="${eid}"]`);

// Opens the info drawer for `eid` from a What's New row and waits for its history.
export async function openDrawerFromWhatsNew(page, eid, name) {
  await openWhatsNew(page);
  await whatsNewRow(page, eid).click();
  const drawer = page.getByTestId("info-drawer");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(name, { exact: true })).toBeVisible();
  // The loading skeleton also says "Inspection History"; a real row says FOLLOWUP.
  await expect(drawer.getByText("FOLLOWUP")).toBeVisible();
  return drawer;
}
