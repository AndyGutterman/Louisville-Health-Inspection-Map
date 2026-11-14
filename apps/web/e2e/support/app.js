// Shared steps for the smoke tests: load the app with mocked data and open things.
import { expect } from "@playwright/test";
import { mockSupabase } from "./mockSupabase.js";

// A blank stand-in for the basemap, used only when E2E_STUB_BASEMAP is set: a Claude
// Code cloud session whose network can't reach *.cartocdn.com can then still run the
// tests (the map draws pins on a plain background). CI always uses the real basemap.
const BLANK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": "#0e0e10" } }],
};

// Loads the map page with Supabase mocked and waits until the splash screen is gone
// (it waits for the map to finish loading). Returns what the page logged as errors.
// counties: ids of the counties to start with switched on, as a returning visitor who
// turned them on would (lib/counties.js). Left out, it's a first visit: Jefferson only.
// categories: keys of the categories to start with switched on (lib/categories.js). Left
// out, every category is on, as for a visitor who turned them all on, so the tests see
// every fixture place; null is a first visit (Restaurants, Retail and Kitchens).
export const ALL_CATEGORIES = [
  "restaurants",
  "retail",
  "caterers_commissary",
  "schools",
  "daycare",
  "hospitals",
  "concessions",
  "unknown",
];
export async function openApp(
  page,
  { path = "/", holds, failOnce, missing, counties, categories = ALL_CATEGORIES } = {},
) {
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`Uncaught: ${err.message}`));

  const mock = await mockSupabase(page, { holds, failOnce, missing });
  // Netlify injects its feedback toolbar ("Netlify Drawer") into deploy previews. It
  // isn't part of the site and can log errors or cover buttons, so serve it empty.
  await page.route(/netlify-cdp-loader\.netlify\.app/, (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
  );
  // Some previews still inject the toolbar's iframe (bottom right), where it covers the
  // Table View's page buttons. Hide it before the page's own scripts run.
  await page.addInitScript(() => {
    const hide = () => {
      const style = document.createElement("style");
      style.textContent =
        '[data-netlify-deploy-id], iframe[title="Netlify Drawer"] { display: none !important; }';
      (document.head || document.documentElement).appendChild(style);
    };
    // Init scripts can run before the document exists (about:blank, early navigation).
    if (document.documentElement) hide();
    else document.addEventListener("DOMContentLoaded", hide, { once: true });
  });
  if (counties) {
    await page.addInitScript((ids) => {
      // Only when nothing is saved yet, so a choice made during the test survives a reload.
      if (!localStorage.getItem("lfs_counties")) {
        localStorage.setItem("lfs_counties", JSON.stringify(ids));
      }
    }, counties);
  }
  if (categories) {
    await page.addInitScript((keys) => {
      if (!localStorage.getItem("lfs_categories")) {
        localStorage.setItem("lfs_categories", JSON.stringify(keys));
      }
    }, categories);
  }
  if (process.env.E2E_STUB_BASEMAP) {
    // Everything else off-site (fonts, map tiles) is answered empty, so a blocked host
    // doesn't show up as a console error.
    const site = new URL(process.env.BASE_URL || "http://localhost:4173").host;
    await page.route(
      (url) => url.host !== site && !/\/(rest|auth|functions)\/v1\//.test(url.pathname),
      (route) =>
        /basemaps\.cartocdn\.com\/.*style\.json/.test(route.request().url())
          ? route.fulfill({
              status: 200,
              contentType: "application/json",
              body: JSON.stringify(BLANK_STYLE),
            })
          : route.fulfill({ status: 200, contentType: "text/css", body: "" }),
    );
  }
  await page.goto(path);
  await expect(page.getByTestId("splash-screen")).toHaveCount(0, { timeout: 20_000 });
  return { consoleErrors, unmocked: mock.unmocked, requested: mock.requested };
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
