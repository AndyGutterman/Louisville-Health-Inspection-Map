// Map interactions driven from the DOM around the map: popups opened from What's New
// and Table View, the popup's save button, and clicking empty map to close the drawer.
// Written before the Map.jsx split so the split can be checked against them.
import { test, expect } from "@playwright/test";
import { openApp, openWhatsNew, whatsNewRow, openDrawerFromWhatsNew } from "./support/app.js";
import { byEid, PINNED_EID } from "./support/fixtures.js";
import { snap } from "./support/screenshots.js";

const popup = (page) => page.locator(".maplibregl-popup");

test("a What's New row with a pin opens its map popup; saving asks a signed-out user to log in", async ({
  page,
}, testInfo) => {
  await openApp(page);
  await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);

  await expect(popup(page)).toHaveCount(1);
  await expect(popup(page)).toContainText(byEid(PINNED_EID).name);
  await expect(popup(page)).toContainText("Score: 82 (C)");
  await snap(page, testInfo, "09-popup-from-whats-new");

  // On phones the What's New panel covers the popup, so close it first (on both projects).
  await page.getByRole("button", { name: "Close What's New" }).click();
  const save = popup(page).getByRole("button", { name: "Save to watchlist" });
  // Big enough to hit with a finger, not just the 18px icon.
  const box = await save.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(32);
  expect(box.height).toBeGreaterThanOrEqual(32);
  await save.click();
  await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
});

test("clicking empty map closes the drawer and the popup", async ({ page }, testInfo) => {
  await openApp(page);
  const drawer = await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);
  await page.getByRole("button", { name: "Close What's New" }).click();
  await expect(popup(page)).toHaveCount(1);

  // A spot with no pins: left of the downtown cluster, clear of every panel.
  const spot = testInfo.project.name === "phone" ? { x: 40, y: 420 } : { x: 300, y: 600 };
  await page.mouse.click(spot.x, spot.y);

  await expect(drawer).toHaveCount(0);
  await expect(popup(page)).toHaveCount(0);
});

test("Table View: hovering a row shows its popup, clicking opens the drawer", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "Hover popups are a desktop interaction.");

  await openApp(page);
  await page.getByRole("button", { name: "Open table view" }).click();
  const row = page
    .getByRole("row")
    .filter({ hasText: byEid(PINNED_EID).name })
    .first();
  await expect(row).toBeVisible();

  await row.hover();
  await expect(popup(page)).toContainText(byEid(PINNED_EID).name);
  await page.mouse.move(5, 300); // off the row, onto the map edge
  await expect(popup(page)).toHaveCount(0);

  await row.click();
  const drawer = page.getByTestId("info-drawer");
  await expect(drawer.getByText(byEid(PINNED_EID).name, { exact: true })).toBeVisible();
  await expect(popup(page)).toContainText(byEid(PINNED_EID).name);
  await snap(page, testInfo, "10-table-view-row");
});

test("What's New hover shows a popup and leaving hides it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "Hover popups are a desktop interaction.");

  await openApp(page);
  await openWhatsNew(page);
  await whatsNewRow(page, PINNED_EID).hover();
  await expect(popup(page)).toContainText(byEid(PINNED_EID).name);
  await page.mouse.move(640, 790);
  await expect(popup(page)).toHaveCount(0);
});

test("opening a second place before the first finishes loading shows the second", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === "phone", "On phones the drawer covers the What's New rows.");

  await openApp(page);
  // Make the first place's "More info" details arrive late.
  await page.route(/v_facility_details/, async (route) => {
    if (route.request().url().includes(`eq.${PINNED_EID}`)) await page.waitForTimeout(1500);
    await route.fallback();
  });

  await openWhatsNew(page);
  await whatsNewRow(page, PINNED_EID).click();
  const drawer = page.getByTestId("info-drawer");
  await expect(drawer.getByText(byEid(PINNED_EID).name, { exact: true })).toBeVisible();

  const second = byEid("100001");
  await whatsNewRow(page, second.eid).click();
  await expect(drawer.getByText(second.name, { exact: true })).toBeVisible();

  await page.waitForTimeout(2000); // the first place's details arrive now
  await expect(drawer.getByText(second.name, { exact: true })).toBeVisible();
  await expect(drawer.getByText(byEid(PINNED_EID).name, { exact: true })).toHaveCount(0);
});

test("a place with violations can be tapped just outside its ring", async ({ page }, testInfo) => {
  await openApp(page);
  const drawer = await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);
  await page.getByRole("button", { name: "Close What's New" }).click();

  // Where the pin is, from its popup: the pointer's tip sits 14px above the pin's centre
  // (popups.jsx, offset [0, -14]).
  await page.waitForTimeout(600); // let any easing finish
  const tip = await popup(page).locator(".maplibregl-popup-tip").boundingBox();
  const pin = { x: tip.x + tip.width / 2, y: tip.y + tip.height + 14 };

  // Close the drawer and popup by clicking empty map (as in the test above).
  const spot = testInfo.project.name === "phone" ? { x: 40, y: 420 } : { x: 300, y: 600 };
  await page.mouse.click(spot.x, spot.y);
  await expect(drawer).toHaveCount(0);

  // At the start zoom the pin reaches about 12.5px (10 on phones) and the ring 14.5px
  // (12); the tap target around a ringed place reaches 20px (17.5). Tap in between.
  const out = testInfo.project.name === "phone" ? 15 : 17;
  await page.mouse.click(pin.x + out, pin.y);
  // A tap on a pin opens its popup (the drawer opens from there).
  await expect(popup(page)).toHaveCount(1);
  await expect(popup(page)).toContainText(byEid(PINNED_EID).name);
});
