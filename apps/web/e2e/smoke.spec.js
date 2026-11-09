// Automated part of docs/SMOKE_TEST.md. Runs on both projects (desktop, phone) unless
// a test says otherwise. Supabase is mocked (support/mockSupabase.js); the map
// basemap loads for real. Tests check the DOM around the map, never canvas pins.
import { test, expect } from "@playwright/test";
import { openApp, openWhatsNew, whatsNewRow, openDrawerFromWhatsNew } from "./support/app.js";
import { byEid, NO_PIN_EID, PINNED_EID, PERFECT_EID } from "./support/fixtures.js";
import { snap } from "./support/screenshots.js";

test("loads with no console errors", async ({ page }, testInfo) => {
  const { consoleErrors, unmocked } = await openApp(page);

  // The splash also goes away after an 8s timeout, so check the map really loaded:
  // the attribution is only filled in once the basemap style has loaded.
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("OpenStreetMap");
  await expect(page.locator("header.app-header")).toBeVisible();
  await expect(page.getByPlaceholder("Search map")).toBeVisible();
  await expect(page.getByTestId("filter-panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "What's New", exact: true })).toBeVisible();
  await snap(page, testInfo, "01-map-loaded");

  expect(consoleErrors, "console errors").toEqual([]);
  expect(unmocked, "Supabase calls with no fixture").toEqual([]);
});

test("filter panel toggles categories", async ({ page }, testInfo) => {
  await openApp(page);
  await page.getByRole("button", { name: "Expand controls" }).click();
  await page.getByRole("tab", { name: "Filter" }).click();

  const tiles = page.getByTestId("category-tile");
  await expect(tiles).toHaveCount(8);
  await snap(page, testInfo, "02-filter-panel");
  const restaurants = tiles.and(page.locator('[data-category="restaurants"]'));

  await expect(restaurants).toHaveAttribute("aria-pressed", "true");
  await restaurants.click();
  await expect(restaurants).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("radio", { name: "All off" }).click();
  for (const tile of await tiles.all()) await expect(tile).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("radio", { name: "All on" }).click();
  for (const tile of await tiles.all()) await expect(tile).toHaveAttribute("aria-pressed", "true");
});

test("phone filter card has even side gaps, collapsed and expanded", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the card only spans the screen on phones");
  await openApp(page);
  const { width } = page.viewportSize();
  const expectEvenGaps = async () => {
    const card = await page.getByTestId("filter-panel").boundingBox();
    expect(card.x).toBeCloseTo(width - (card.x + card.width), 0);
  };

  await expectEvenGaps(); // starts collapsed
  await page.getByRole("button", { name: "Expand controls" }).click();
  await expectEvenGaps();
});

test("What's New and Table View buttons line up", async ({ page }) => {
  await openApp(page);
  const centerY = async (name) => {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    return box.y + box.height / 2;
  };
  expect(await centerY("What's New")).toBeCloseTo(await centerY("Open table view"), 0);
});

test("What's New opens and switches tabs", async ({ page }, testInfo) => {
  await openApp(page);
  const panel = await openWhatsNew(page);

  await expect(whatsNewRow(page, PINNED_EID)).toContainText(byEid(PINNED_EID).name);
  await expect(whatsNewRow(page, NO_PIN_EID)).toContainText("Location unavailable");
  await snap(page, testInfo, "03-whats-new-violations");

  await panel.getByRole("button", { name: "Top Scores" }).click();
  await expect(whatsNewRow(page, PERFECT_EID)).toContainText(byEid(PERFECT_EID).name);
  await snap(page, testInfo, "04-whats-new-top-scores");
});

test("a What's New row with no coordinates still opens the drawer", async ({ page }, testInfo) => {
  await openApp(page);
  const drawer = await openDrawerFromWhatsNew(page, NO_PIN_EID, byEid(NO_PIN_EID).name);

  await expect(drawer.getByTestId("drawer-no-location")).toHaveText(
    "No map location on file for this establishment.",
  );
  // No pin, so no map popup either: the map is left alone.
  await expect(page.locator(".maplibregl-popup")).toHaveCount(0);
  await snap(page, testInfo, "05-drawer-no-location");
});

test("phone: the drawer is a bottom sheet that drags between peek and expanded", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "The bottom sheet only exists under 600px.");

  await openApp(page);
  const drawer = await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);
  const handle = page.getByTestId("drawer-handle");
  const viewport = page.viewportSize();
  const height = async () => (await drawer.boundingBox()).height;

  // A bottom sheet: full width, flush with the bottom of the screen, resting at peek.
  const box = await drawer.boundingBox();
  expect(box.width).toBeCloseTo(viewport.width, 0);
  expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
  await expect(handle).toHaveAttribute("aria-label", "Expand details");
  const peek = await height();
  const expanded = Math.round(viewport.height * 0.74); // EXPANDED_FRACTION in lib/bottomSheet.js
  expect(peek).toBeLessThan(expanded);
  await snap(page, testInfo, "06-drawer-peek");

  const drag = async (dy) => {
    const b = await handle.boundingBox();
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + dy, { steps: 12 });
    await page.mouse.up();
  };

  await drag(-(expanded - peek)); // up
  await expect.poll(height).toBeCloseTo(expanded, -1);
  await expect(handle).toHaveAttribute("aria-label", "Collapse details");
  await snap(page, testInfo, "07-drawer-expanded");

  await drag(expanded - peek); // back down
  await expect.poll(height).toBeCloseTo(peek, -1);
  await expect(handle).toHaveAttribute("aria-label", "Expand details");
  await expect(drawer).toBeVisible();
});

test("opening and closing What's New does not close the drawer", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name === "phone",
    "On phones the open drawer covers the What's New button.",
  );

  await openApp(page);
  const drawer = await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);

  await page.getByRole("button", { name: "Close What's New" }).click();
  await expect(page.getByTestId("whats-new-panel")).toHaveCount(0);
  await expect(drawer).toBeVisible();

  const panel = await openWhatsNew(page);
  await panel.getByRole("button", { name: "Top Scores" }).click();
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(byEid(PINNED_EID).name, { exact: true })).toBeVisible();
  await snap(page, testInfo, "08-drawer-beside-whats-new");
});

test("draws the county outline and credits its source", async ({ page }) => {
  const outline = page.waitForResponse((r) => r.url().endsWith("/regions/jefferson.geojson"));
  await openApp(page);
  expect((await outline).status()).toBe(200);
  // MapLibre adds a source's credit to the attribution control once the source is in use.
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("Who's On First");
});
