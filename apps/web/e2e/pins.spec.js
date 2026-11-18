// The pin control center (features/pins, docs/PINS.md). Supabase is mocked, so these
// check what the page shows and what it asks the database to do; that the database
// refuses anyone who isn't an admin, and what each fix writes, is checked in SQL.
import { test, expect } from "@playwright/test";
import { mockAuth, openApp, signIn, TEST_USER } from "./support/app.js";
import { PIN_ROAD, PIN_TYPO } from "./support/fixtures.js";
import { snap } from "./support/screenshots.js";

// The pins-dispatch edge function, mocked: records each call, answers `answer`.
async function mockDispatch(page, answer = { started: true }) {
  const calls = [];
  await page.route(/\/functions\/v1\/pins-dispatch/, async (route) => {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": request.headers()["origin"] || "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push({ auth: request.headers()["authorization"] });
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: "application/json",
      body: JSON.stringify(answer),
    });
  });
  return calls;
}

// Opens /?page=pins signed out and signs in from the page's own "Log in".
async function openPins(page, { admin = true, dispatch } = {}) {
  await mockAuth(page);
  const calls = await mockDispatch(page, dispatch);
  const app = await openApp(page, { path: "/?page=pins", answers: { "rpc/is_admin": admin } });
  const gate = page.getByTestId("admin-gate");
  await expect(gate).toContainText("Sign in with an admin account to fix the map's pins");
  await gate.getByRole("button", { name: "Log in" }).click();
  await signIn(page);
  return { calls, ...app };
}

const saved = (page) =>
  page.waitForRequest(
    (r) => r.method() === "POST" && r.url().includes("/rest/v1/rpc/admin_save_place_fix"),
  );
const editor = (page) => page.getByTestId("place-editor");

test("the pin control center turns away anyone who isn't an admin", async ({ page }) => {
  const { requested } = await openPins(page, { admin: false });
  const gate = page.getByTestId("admin-gate");
  await expect(gate).toContainText("Admins only");
  await expect(gate).toContainText(`${TEST_USER.email} isn't an admin`);
  await expect(page.getByTestId("pin-queue")).toHaveCount(0);
  expect(requested.filter((p) => p.startsWith("rpc/admin_"))).toEqual([]);
});

test("an admin sees the busiest county's queue and fixes a typo'd town", async ({
  page,
}, testInfo) => {
  await openPins(page);
  // Jefferson has the most to look at, so the page opens there, on "No pin".
  await expect(page.getByTestId("pin-county")).toHaveValue("jefferson");
  await expect(page.getByRole("button", { name: "No pin 1,179" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("1–25 of 1,179")).toBeVisible();
  await expect(page.getByTestId("pin-job")).toContainText("1 address fix waiting");

  // Oldham's queue; the first place is selected, its source address shown as it is.
  await page.getByTestId("pin-county").selectOption("oldham");
  await expect(editor(page).getByTestId("source-address")).toHaveText(
    "3000 ASH AVE., PEEWEE VALLEY",
  );
  await expect(page.getByRole("button", { name: "Left off map 3" })).toBeVisible();
  await snap(page, testInfo, "pins-queue");

  await editor(page).getByLabel("Town").fill("PEWEE VALLEY");
  const request = saved(page);
  await editor(page).getByRole("button", { name: "Save address" }).click();
  expect((await request).postDataJSON()).toEqual({
    p_place_id: PIN_TYPO.id,
    p_action: "address",
    p_address: "3000 ASH AVE.",
    p_city: "PEWEE VALLEY",
    p_note: null,
    p_also: [],
  });
  await expect(page.getByTestId("pins-notice")).toContainText("Address saved");
  // The saved place leaves the queue: the next one is selected.
  await expect(editor(page).getByTestId("source-address")).toHaveText("HWY 146, CRESTWOOD");
});

test("a pin pasted by hand is saved for every place at the address", async ({ page }) => {
  await openPins(page);
  await page.getByTestId("pin-county").selectOption("oldham");
  await page.getByRole("button", { name: new RegExp(PIN_ROAD.name) }).click();
  await expect(editor(page).getByRole("button", { name: "Use this pin" })).toBeDisabled();
  await editor(page).getByLabel("Latitude, longitude").fill("38.33211, -85.46568");
  await editor(page)
    .getByLabel(/Apply my fix to the 1 other place/)
    .check();
  const request = saved(page);
  await editor(page).getByRole("button", { name: "Use this pin" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    p_place_id: PIN_ROAD.id,
    p_action: "pin",
    p_lon: -85.46568,
    p_lat: 38.33211,
    p_also: ["oldham-223"],
  });
  await expect(page.getByTestId("pins-notice")).toContainText("on the map now");
});

test("Geocode now starts the job and shows each fix as it comes back", async ({
  page,
}, testInfo) => {
  await page.clock.install();
  const { calls } = await openPins(page);
  await page.getByRole("button", { name: "Geocode now" }).click();
  await expect(page.getByTestId("pins-notice")).toContainText("Looking up");
  expect(calls).toHaveLength(1);
  expect(calls[0].auth).toMatch(/^Bearer /);
  const list = page.getByTestId("pin-job-list");
  await expect(list).toContainText("looking it up");

  // The first check, 10 s later: the fix was found.
  const polled = page.waitForRequest((r) => r.url().includes("rpc/admin_place_fix_status"));
  await page.clock.runFor(10_000);
  expect((await polled).postDataJSON()).toEqual({ p_ids: [PIN_TYPO.id, PIN_ROAD.id] });
  await expect(list).toContainText(`${PIN_TYPO.name}: found, on the map`);
  await snap(page, testInfo, "pins-geocode-now");
});

test("Geocode now says why when the job couldn't start", async ({ page }) => {
  await openPins(page, { dispatch: { started: false, reason: "no_token" } });
  await page.getByRole("button", { name: "Geocode now" }).click();
  const notice = page.getByTestId("pins-notice");
  await expect(notice).toContainText("the GitHub token isn't set up");
  await expect(notice.getByRole("link", { name: "Pin fixes on GitHub" })).toBeVisible();
});

test("an admin reaches the pin control center from the Saved panel", async ({ page }) => {
  await mockAuth(page);
  await openApp(page, { answers: { "rpc/is_admin": true } });
  await page.locator(".header-nav-btn--login").click();
  await signIn(page);
  await page.getByRole("button", { name: "Saved" }).click();
  await page.getByTestId("open-pins").click();
  await expect(page.getByTestId("pin-queue")).toBeVisible();
  // And on to the email admin page from its header.
  await page.getByRole("button", { name: "Email admin" }).click();
  await expect(page.getByRole("tab", { name: "Digest" })).toBeVisible();
});
