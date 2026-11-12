// Automated part of docs/SMOKE_TEST.md. Runs on both projects (desktop, phone) unless
// a test says otherwise. Supabase is mocked (support/mockSupabase.js); the map
// basemap loads for real. Tests check the DOM around the map, never canvas pins.
import { test, expect } from "@playwright/test";
import { openApp, openWhatsNew, whatsNewRow, openDrawerFromWhatsNew } from "./support/app.js";
import {
  byEid,
  BULLITT_EID,
  BULLITT_NAME,
  NO_PIN_EID,
  PINNED_EID,
  PERFECT_EID,
} from "./support/fixtures.js";
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

  await expect(page.getByTestId("pins-loading")).toHaveCount(0); // everything arrived
  expect(consoleErrors, "console errors").toEqual([]);
  expect(unmocked, "Supabase calls with no fixture").toEqual([]);
});

test("the map shows while the rest of the data loads, with a corner indicator", async ({
  page,
}, testInfo) => {
  // The violation rings are held back: the splash lifts on the first pins, not on them.
  let release;
  const flagsArrive = new Promise((r) => (release = r));
  const { consoleErrors } = await openApp(page, {
    holds: { "rpc/get_violation_flags": flagsArrive },
  });
  const pill = page.getByTestId("pins-loading");
  await expect(pill).toContainText("Loading places");
  await expect(page.locator(".maplibregl-ctrl-attrib")).toContainText("OpenStreetMap");
  await snap(page, testInfo, "01b-pins-loading");
  release();
  await expect(pill).toHaveCount(0);
  expect(consoleErrors, "console errors").toEqual([]);
});

test("a second visit within 6 hours draws the pins from the browser, not the database", async ({
  page,
  context,
}) => {
  const pinReads = (requested) =>
    requested.filter((p) =>
      [
        "v_facility_map_feed",
        "facilities",
        "rpc/get_violation_flags",
        "v_bullitt_map_feed",
      ].includes(p),
    );
  const first = await openApp(page);
  await expect(page.getByTestId("pins-loading")).toHaveCount(0); // complete, so it's kept
  expect(pinReads(first.requested)).toContain("v_facility_map_feed");
  await page.close();

  // A new tab, like coming back later: it shares localStorage, not sessionStorage.
  const again = await context.newPage();
  const second = await openApp(again);
  await expect(again.getByTestId("pins-loading")).toHaveCount(0);
  expect(pinReads(second.requested)).toEqual([]);
});

test("a failed page of pins is tried again, and the map finishes loading", async ({ page }) => {
  const { consoleErrors } = await openApp(page, { failOnce: ["v_facility_map_feed"] });
  await expect(page.getByTestId("pins-loading")).toHaveCount(0, { timeout: 10_000 });
  // The browser logs the deliberate 503 itself; nothing else may error.
  expect(consoleErrors.filter((e) => !e.includes("503"))).toEqual([]);
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

test("phone: panels have no blur, and the map draws at most 2x", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "the phone-only performance rules");
  await openApp(page);

  // Blurring the moving map behind a panel made panning choppy on iPhones.
  for (const sel of [".control-card", ".app-header", ".wn-trigger", ".table-toggle-btn"]) {
    const style = await page
      .locator(sel)
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el);
        return { blur: cs.backdropFilter, bg: cs.backgroundColor };
      });
    expect(style.blur, `${sel} backdrop-filter`).toBe("none");
    expect(style.bg, `${sel} background`).toMatch(/^rgb\(/); // solid, not rgba
  }

  // The Pixel 7 reports 2.625x; the canvas is capped at 2x its CSS size.
  const ratio = await page
    .locator(".maplibregl-canvas")
    .evaluate((c) => c.width / c.getBoundingClientRect().width);
  expect(ratio).toBeLessThanOrEqual(2.01);
});

test("the page itself never scrolls", async ({ page }) => {
  await openApp(page);
  // Phone browsers can make the page taller than the screen (100vh ignores the address
  // bar). Playwright has no address bar, so force the page taller and try to scroll it.
  await page.evaluate(() => {
    const filler = document.createElement("div");
    filler.style.height = "3000px";
    document.body.appendChild(filler);
  });
  const header = await page.getByRole("banner").boundingBox();
  await page.mouse.move(header.x + 8, header.y + 8);
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
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

test("violations are listed without a critical label", async ({ page }, testInfo) => {
  await openApp(page);
  // The data's yes/no critical flag can't tell the Food Code's kinds of violation apart,
  // so the site shows every citation simply as a violation.
  const drawer = await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);
  await expect(whatsNewRow(page, PINNED_EID)).toContainText("2 violations");
  await expect(page.getByTestId("whats-new-panel")).not.toContainText(/critical/i);

  await drawer.getByText("2 violations").first().click();
  await expect(drawer.getByText("Food held at improper temperature")).toBeVisible();
  await expect(drawer).not.toContainText(/critical/i);

  // Long notes are cut short behind a "Read more" button, in white so it reads on the
  // dark card (it was dark red and nearly invisible).
  const readMore = drawer.getByRole("button", { name: "Read more" }).first();
  await expect(readMore).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(drawer).not.toContainText("rechecked at the follow-up inspection.");
  await snap(page, testInfo, "11-drawer-read-more");
  await readMore.click();
  await expect(drawer).toContainText("rechecked at the follow-up inspection.");
  await drawer.getByRole("button", { name: "Show less" }).first().click();
  await expect(drawer.getByRole("button", { name: "Read more" }).first()).toBeVisible();
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

test("both counties show at once, with every filter", async ({ page }, testInfo) => {
  const jefferson = page.waitForResponse((r) => r.url().endsWith("/regions/jefferson.geojson"));
  const bullitt = page.waitForResponse((r) => r.url().endsWith("/regions/bullitt.geojson"));
  const { consoleErrors, unmocked } = await openApp(page);
  expect((await jefferson).status()).toBe(200);
  expect((await bullitt).status()).toBe(200);

  // No county toggle any more: the date filter and the categories are always there, and
  // the Filter tab explains how Bullitt's undated, untyped places are handled.
  await expect(page.getByRole("radio", { name: "Bullitt" })).toHaveCount(0);
  await expect(page.getByLabel("Filter pins by inspection date")).toBeVisible();
  await page.getByRole("button", { name: "Expand controls" }).click();
  await page.getByRole("tab", { name: "Filter" }).click();
  await expect(page.getByTestId("category-tile")).toHaveCount(8);
  await expect(page.getByTestId("county-note")).toContainText("Bullitt County Health Department");
  // Narrowing the categories hides Bullitt pins (no facility types); the note says so.
  await expect(page.getByTestId("county-note")).toContainText("only while every category is on");
  await snap(page, testInfo, "12-both-counties-filters");

  expect(consoleErrors, "console errors").toEqual([]);
  expect(unmocked, "Supabase calls with no fixture").toEqual([]);
});

test("Table View lists both counties and searches across them", async ({ page }, testInfo) => {
  const { consoleErrors, unmocked } = await openApp(page);
  await page.getByRole("button", { name: "Open table view" }).click();
  const panel = page.getByTestId("table-panel");
  const rows = panel.getByTestId("table-row");
  await expect(rows.filter({ hasText: byEid(PINNED_EID).name }).first()).toBeVisible();
  await expect(rows.filter({ hasText: BULLITT_NAME }).first()).toBeVisible();
  // Bullitt's routine inspection has no date.
  await expect(rows.filter({ hasText: "Not published" }).first()).toBeVisible();

  // One search covers both counties: name, street, city and zip in the same view.
  const searched = page.waitForRequest(
    (r) => r.url().includes("/rest/v1/v_table_latest") && r.url().includes("city.imatch"),
  );
  await panel.getByLabel("Search the table").fill("Shepherdsville");
  const url = decodeURIComponent((await searched).url());
  expect(url).toContain("name.imatch.s[^a-z0-9]*h[^a-z0-9]*e");
  expect(url).not.toContain("region=eq.");
  await snap(page, testInfo, "13-table-view-search");

  // Spacing and punctuation don't matter: "Mc Donald's" asks for the same loose match as
  // "mcdonalds", one group per word, so McDonalds, Mc Donald's and MC'DONALDS all come back.
  const loose = page.waitForRequest(
    (r) =>
      r.url().includes("/rest/v1/v_table_latest") &&
      decodeURIComponent(r.url()).includes("name.imatch.d[^a-z0-9]*o"),
  );
  await panel.getByLabel("Search the table").fill("Mc Donald's");
  const looseUrl = decodeURIComponent((await loose).url());
  expect(looseUrl).toContain("name.imatch.m[^a-z0-9]*c,");
  expect(looseUrl).toContain("name.imatch.d[^a-z0-9]*o[^a-z0-9]*n");
  expect(looseUrl).toMatch(/and\(or\(name\.imatch/);

  // The county chips narrow it. On phones they fold behind the Filters button.
  if (testInfo.project.name === "phone") {
    await expect(panel.getByTestId("table-filters")).toHaveCount(0);
    await panel.getByTestId("table-filters-toggle").click();
  }
  const narrowed = page.waitForRequest((r) => r.url().includes("region=eq.bullitt"));
  await panel.getByTestId("table-county-bullitt").click();
  await narrowed;
  await snap(page, testInfo, "14-table-view-filters");

  expect(consoleErrors, "console errors").toEqual([]);
  expect(unmocked, "Supabase calls with no fixture").toEqual([]);
});

test("Table View: facility chips only filter Jefferson County", async ({ page }, testInfo) => {
  await openApp(page);
  await page.getByRole("button", { name: "Open table view" }).click();
  const panel = page.getByTestId("table-panel");
  await expect(panel.getByTestId("table-row").first()).toBeVisible();
  if (testInfo.project.name === "phone") await panel.getByTestId("table-filters-toggle").click();

  // Bullitt's data has no facility types: the row says so instead of offering chips.
  await panel.getByTestId("table-county-bullitt").click();
  await expect(panel.getByTestId("table-facility-note")).toContainText("Bullitt County");
  await expect(panel.getByRole("button", { name: "Restaurants" })).toHaveCount(0);

  // With both counties, picking a facility switches the County chips to Jefferson.
  await panel.getByRole("button", { name: "Both", exact: true }).click();
  const filtered = page.waitForRequest(
    (r) => r.url().includes("region=eq.jefferson") && r.url().includes("facility_type"),
  );
  await panel.getByRole("button", { name: "Restaurants" }).click();
  await filtered;
  await expect(panel.getByTestId("table-county-jefferson")).toHaveClass(/active/);

  // Going back to Bullitt clears the facility pick.
  await panel.getByTestId("table-county-bullitt").click();
  await expect(panel.getByTestId("table-facility-note")).toBeVisible();
  await panel.getByRole("button", { name: "Both", exact: true }).click();
  await expect(panel.getByRole("button", { name: "All", exact: true }).last()).toHaveClass(
    /active/,
  );
});

test("Table View asks for a row count only when the filters change", async ({ page }, testInfo) => {
  await openApp(page);
  const counted = []; // one entry per request: did it ask for a count?
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/v_table_latest")) {
      counted.push(/count=exact/.test(r.headers()["prefer"] || ""));
    }
  });
  await page.getByRole("button", { name: "Open table view" }).click();
  const panel = page.getByTestId("table-panel");
  await expect(panel.getByTestId("table-row").first()).toBeVisible();
  expect(counted).toEqual([true]);

  // 21 fixture rows: at 10 a page there is a page 2. Neither step changes the count.
  if (testInfo.project.name === "phone") {
    await panel.getByLabel("Rows per page").selectOption("10");
  } else {
    await panel.getByRole("button", { name: "10", exact: true }).click();
  }
  await expect.poll(() => counted.length).toBe(2);
  await panel.getByRole("button", { name: /^(›|Next page)$/ }).click();
  await expect.poll(() => counted.length).toBe(3);
  expect(counted).toEqual([true, false, false]);

  // A filter does.
  await panel.getByRole("button", { name: "Hide N/A" }).click();
  await expect.poll(() => counted.at(-1)).toBe(true);
});

test("What's New includes Bullitt County, labelled by the day its score was posted", async ({
  page,
}, testInfo) => {
  const { consoleErrors, unmocked } = await openApp(page);
  const panel = await openWhatsNew(page);
  const row = whatsNewRow(page, BULLITT_EID);
  await expect(row).toContainText(BULLITT_NAME);
  await expect(row).toContainText("Bullitt");
  // No inspection date is published for it, so it never shows one.
  await expect(row).toContainText("posted");
  await snap(page, testInfo, "15-whats-new-bullitt");

  await panel.getByRole("button", { name: "Top Scores" }).click();
  await expect(page.locator('[data-testid="whats-new-row"][data-eid^="bullitt-"]')).toHaveCount(1);

  await panel.getByRole("button", { name: "Violations", exact: true }).click();
  await whatsNewRow(page, BULLITT_EID).click();
  const drawer = page.getByTestId("info-drawer");
  await expect(drawer.getByText(BULLITT_NAME, { exact: true })).toBeVisible();
  // The header shows the latest record, the dated follow-up, so it isn't an estimate;
  // the older routine result's date still is. Bullitt publishes no grades, so none show.
  await expect(drawer.getByText("Date", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Date (estimated)")).toHaveCount(0);
  await expect(drawer.getByText("Grade", { exact: true })).toHaveCount(0);
  await expect(drawer.getByTestId("drawer-source-note")).toContainText("estimates");
  await drawer.getByRole("button", { name: /2 violations/ }).click();
  await expect(drawer.getByTestId("violations-note")).toContainText("inspection form");
  await snap(page, testInfo, "16-bullitt-drawer");

  expect(consoleErrors, "console errors").toEqual([]);
  expect(unmocked, "Supabase calls with no fixture").toEqual([]);
});

test("the Learn page links one data source per county and says how they differ", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "Learn" }).click();
  const sources = page.getByTestId("data-sources");
  await expect(sources.getByRole("listitem")).toHaveCount(2);
  await expect(sources.getByRole("link")).toHaveCount(2);
  await expect(
    sources.getByRole("link", { name: "Bullitt County Health Department" }),
  ).toHaveAttribute("href", "https://www.bullitthealth.org/food");
  await expect(sources.getByRole("link", { name: "Louisville Metro Open Data" })).toBeVisible();
  await expect(sources).toContainText("no inspection date");
});

test("score sliders: the coloured bar stays under the handle while it is dragged", async ({
  page,
}, testInfo) => {
  const { consoleErrors } = await openApp(page);
  await page.getByRole("button", { name: "Expand controls" }).click();
  const handle = page.getByRole("slider", { name: "red handle" });
  const bar = page.locator(".wb2-fill.red");
  await expect(handle).toHaveAttribute("aria-valuenow", "84");
  await expect(page.getByRole("button", { name: "Balanced" })).toHaveClass(/active/);

  // Where the handle's centre and the bar's right end are, in pixels.
  const edges = async () => {
    const h = await handle.boundingBox();
    const b = await bar.boundingBox();
    return { handle: h.x + h.width / 2, bar: b.x + b.width };
  };

  const start = await handle.boundingBox();
  const y = start.y + start.height / 2;
  await page.mouse.move(start.x + start.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(start.x - 60, y, { steps: 6 });
  // Still held down: one frame later the bar must already be at the handle (it used to
  // trail behind on a 0.35s animation).
  await page.waitForTimeout(50);
  const mid = await edges();
  expect(Math.abs(mid.handle - mid.bar)).toBeLessThan(2);
  await snap(page, testInfo, "17-slider-dragging");
  await page.mouse.up();

  const value = Number(await handle.getAttribute("aria-valuenow"));
  expect(value).toBeLessThan(84);
  // A custom value is no preset.
  await expect(page.getByRole("button", { name: "Balanced" })).not.toHaveClass(/active/);

  // The value holds once the map has caught up, and the arrow keys still step by one.
  await page.waitForTimeout(1200);
  await expect(handle).toHaveAttribute("aria-valuenow", String(value));
  await handle.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", String(value + 1));
  expect(consoleErrors, "console errors").toEqual([]);
});

test("sign in with the code from the email, no link needed", async ({ page }, testInfo) => {
  // Supabase Auth is mocked here: sending the email, then checking the code.
  const verifyBodies = [];
  await page.route(/\/auth\/v1\/(otp|verify)/, async (route) => {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": request.headers()["origin"] || "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (body) =>
      route.fulfill({ status: 200, headers: cors, contentType: "application/json", body });
    if (request.url().includes("/otp")) return json("{}");
    verifyBodies.push(request.postDataJSON());
    const now = Math.floor(Date.now() / 1000);
    return json(
      JSON.stringify({
        access_token: "test-access-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: now + 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "00000000-0000-0000-0000-000000000001",
          aud: "authenticated",
          email: "test@example.com",
        },
      }),
    );
  });

  await openApp(page);
  await page.locator(".header-nav-btn--login").click();
  await page.getByPlaceholder("you@example.com").fill("test@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();

  const step = page.getByTestId("sign-in-code-step");
  await expect(step).toContainText("test@example.com");
  const signIn = step.getByRole("button", { name: "Sign in" });
  await expect(signIn).toBeDisabled();
  await step.getByLabel("Sign-in code").fill("123 456"); // pasted with a space
  await expect(step.getByLabel("Sign-in code")).toHaveValue("123456");
  await snap(page, testInfo, "sign-in-code");
  await signIn.click();

  await expect(step).toHaveCount(0); // modal closes
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  expect(verifyBodies[0]).toMatchObject({ email: "test@example.com", token: "123456" });
});
