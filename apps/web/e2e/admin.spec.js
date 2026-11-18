// The email admin page (features/admin, docs/EMAIL_ADMIN.md). Supabase is mocked, so
// these check what the page shows and what it asks the database to do; that the database
// refuses anyone who isn't an admin is checked in SQL (the migration's own notes).
import { test, expect } from "@playwright/test";
import { mockAuth, openApp, signIn, TEST_USER } from "./support/app.js";
import { JANE, QUEUED_JOB_ID } from "./support/fixtures.js";
import { snap } from "./support/screenshots.js";

// The email-dispatch edge function, mocked: records what it was sent, answers `answer`.
async function mockDispatch(page, answer = { started: true }) {
  const calls = [];
  await page.route(/\/functions\/v1\/email-dispatch/, async (route) => {
    const request = route.request();
    const cors = {
      "access-control-allow-origin": request.headers()["origin"] || "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "POST, OPTIONS",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    calls.push({ body: request.postDataJSON(), auth: request.headers()["authorization"] });
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: "application/json",
      body: JSON.stringify(answer),
    });
  });
  return calls;
}

// Opens /?page=admin signed out and signs in from the page's own "Log in".
async function openAdmin(page, { admin = true, dispatch } = {}) {
  await mockAuth(page);
  const calls = await mockDispatch(page, dispatch);
  await openApp(page, { path: "/?page=admin", answers: { "rpc/is_admin": admin } });
  const gate = page.getByTestId("admin-gate");
  await expect(gate).toContainText("Sign in with an admin account");
  await gate.getByRole("button", { name: "Log in" }).click();
  await signIn(page);
  return calls;
}

const queued = (page) =>
  page.waitForRequest(
    (r) => r.method() === "POST" && r.url().includes("/rest/v1/rpc/admin_queue_email"),
  );
// A tab's panel stays in the page once opened (hidden), so look inside the one showing.
const panel = (page) => page.getByRole("tabpanel");
const emailFrame = (page) => panel(page).frameLocator('iframe[title="Email preview"]');

test("the email admin page turns away anyone who isn't an admin", async ({ page }, testInfo) => {
  const { requested } = await (async () => {
    await mockAuth(page);
    return openApp(page, { path: "/?page=admin" });
  })();
  // Signed out: nothing but a way to sign in, and the link is taken off the address.
  const gate = page.getByTestId("admin-gate");
  await expect(gate).toContainText("Sign in with an admin account");
  await expect(page).toHaveURL(/\/$/);
  await gate.getByRole("button", { name: "Log in" }).click();
  await signIn(page);

  // Signed in, but not an admin: turned away, and none of the admin reads are made.
  await expect(gate).toContainText("Admins only");
  await expect(gate).toContainText(`${TEST_USER.email} isn't an admin`);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await snap(page, testInfo, "admin-not-an-admin");
  expect(requested.filter((p) => p.startsWith("rpc/admin_"))).toEqual([]);

  // The Saved panel has no way in for them either.
  await page.getByRole("button", { name: "Back to the map" }).click();
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByTestId("digest-toggle")).toBeVisible();
  await expect(page.getByTestId("open-admin")).toHaveCount(0);
});

test("an admin reaches the page from the Saved panel", async ({ page }) => {
  await mockAuth(page);
  await openApp(page, { answers: { "rpc/is_admin": true } });
  await page.locator(".header-nav-btn--login").click();
  await signIn(page);
  await page.getByRole("button", { name: "Saved" }).click();
  await page.getByTestId("open-admin").click();
  await expect(page.getByTestId("admin-page")).toContainText("Email admin");
  await expect(page.getByRole("tab", { name: "Digest" })).toHaveAttribute("aria-selected", "true");
});

test("an admin previews a subscriber's digest and sends it to themselves as a test", async ({
  page,
}, testInfo) => {
  // The week's inspections are asked for with the window in the request, so the database
  // sends the digest's rows and not What's New's whole 30 days.
  const week = page.waitForRequest((r) => /\/rpc\/get_whats_new\?.*or=/.test(r.url()));
  const dispatched = await openAdmin(page);
  expect(decodeURIComponent((await week).url())).toMatch(
    /or=\(inspection_date\.gte\.\d{4}-\d\d-\d\d,and\(inspection_date\.is\.null,posted_date\.gte\./,
  );

  // The week, and who gets it.
  await expect(page.getByTestId("admin-week")).toContainText(/\d+ inspections? · \d+ failing/);
  await expect(page.getByTestId("admin-people-count")).toHaveText("2 subscribers · 3 accounts");
  await expect(page.getByTestId("admin-person")).toHaveCount(3);

  // First the email everyone gets: this week's failing place, no watch areas.
  await expect(panel(page).getByTestId("email-preview-subject")).toContainText("this week");
  await expect(emailFrame(page).getByText("River City Tacos").first()).toBeVisible();
  await expect(emailFrame(page).getByText("Your watch area")).toHaveCount(0);

  // Jane's has her watch area above it, and her unsubscribe link in the footer.
  await page.getByTestId("admin-person").filter({ hasText: JANE.email }).click();
  await expect(page.getByTestId("admin-preview-who")).toHaveText(JANE.email);
  await expect(emailFrame(page).getByText("Your watch area · 2 mi")).toBeVisible();
  await expect(emailFrame(page).getByText("Home", { exact: true })).toBeVisible();
  await expect(emailFrame(page).getByRole("link", { name: "Unsubscribe" })).toBeVisible();
  // Her saved places come first. River City Tacos is saved, in her watch area and failing:
  // it is listed once, with the saved places.
  await expect(emailFrame(page).getByText("Your saved places")).toBeVisible();
  await expect(emailFrame(page).getByText("1 of your 4 saved places was inspected")).toBeVisible();
  await expect(emailFrame(page).getByText("River City Tacos")).toHaveCount(1);
  await snap(page, testInfo, "admin-digest-preview");

  // The plain-text version some mail apps show.
  await panel(page).getByRole("button", { name: "Plain text" }).click();
  await expect(panel(page).getByTestId("email-preview-text")).toContainText(
    "Your saved places: 1 of your 4 saved places was inspected this week.",
  );
  await expect(panel(page).getByTestId("email-preview-text")).toContainText(
    "Your watch area: Home (2 mi)",
  );
  await panel(page).getByRole("button", { name: "Email", exact: true }).click();

  // "Send me this": Jane's digest, to the admin's own address, marked as a test.
  const request = queued(page);
  await page.getByRole("button", { name: "Send me this as a test" }).click();
  expect((await request).postDataJSON()).toMatchObject({
    p_kind: "digest",
    p_audience: "emails",
    p_to_emails: [TEST_USER.email],
    p_as_user: JANE.id,
    p_days: 7,
    p_test: true,
    p_expect_count: null,
  });

  // The sender is asked to start, as the signed-in admin, and the Sent tab takes over.
  await expect(page.getByTestId("admin-notice")).toContainText("the sender is starting");
  expect(dispatched).toEqual([{ body: { job: QUEUED_JOB_ID }, auth: "Bearer test-access-token" }]);
  await expect(page.getByRole("tab", { name: "Sent" })).toHaveAttribute("aria-selected", "true");
  const jobs = page.getByTestId("admin-job");
  await expect(jobs).toHaveCount(3);
  await expect(jobs.first()).toContainText(`Test: Weekly digest to ${TEST_USER.email}`);
  await expect(jobs.first()).toContainText(`Written as ${JANE.email}`);
  await expect(jobs.nth(2)).toContainText("Tuesday's send");
  await snap(page, testInfo, "admin-sent");
});

test("emailing someone their digest asks first; taking them off the digest is one tap", async ({
  page,
}) => {
  await openAdmin(page);
  await page.getByTestId("admin-person").filter({ hasText: JANE.email }).click();

  // Sending to a real person is two steps, and can be backed out of.
  await page.getByRole("button", { name: "Send it to them" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Send it to them" }).click();
  const request = queued(page);
  await page.getByRole("button", { name: `Yes, email ${JANE.email}` }).click();
  expect((await request).postDataJSON()).toMatchObject({
    p_audience: "emails",
    p_to_emails: [JANE.email],
    p_as_user: null,
    p_test: false,
  });

  // Back on the Digest tab, Jane is still picked. Take her off the weekly digest.
  await page.getByRole("tab", { name: "Digest" }).click();
  const change = page.waitForRequest((r) => r.url().includes("/rpc/admin_set_subscription"));
  await page.getByRole("button", { name: "Take off the weekly digest" }).click();
  expect((await change).postDataJSON()).toEqual({ p_user_id: JANE.id, p_on: false });
  await expect(page.getByTestId("admin-people-count")).toHaveText("1 subscriber · 3 accounts");
  await expect(page.getByRole("button", { name: "Put on the weekly digest" })).toBeVisible();
});

test("a one-off email is previewed as typed; every subscriber needs the count typed", async ({
  page,
}, testInfo) => {
  // The sender can't be started here (no GitHub token): the page says how to start it.
  await openAdmin(page, { dispatch: { started: false, reason: "no_token" } });
  await page.getByRole("tab", { name: "Write" }).click();

  const send = page.getByRole("button", { name: "Send me a test" });
  await expect(send).toBeDisabled(); // nothing written yet
  await page.getByRole("textbox", { name: "Subject" }).fill("Oldham County is here");
  await page
    .getByRole("textbox", { name: "Message" })
    .fill(
      "It's on the map now: https://example.com/oldham.\n\n- <b>Switch it on</b>\n- Look around",
    );

  // The preview is the email: a link, a list, and the typed HTML shown as text.
  const frame = emailFrame(page);
  await expect(panel(page).getByTestId("email-preview-subject")).toHaveText(
    "[Test] Oldham County is here",
  );
  // (The frame is a document of its own and loads after the typing stops: give it time.)
  await expect(frame.getByRole("link", { name: "https://example.com/oldham" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(frame.getByRole("listitem")).toHaveCount(2);
  await expect(frame.getByText("<b>Switch it on</b>")).toBeVisible();
  await expect(frame.getByRole("link", { name: "Open the map" })).toBeVisible();
  await expect(send).toBeEnabled();

  // A list of addresses: a bad one is named, and nothing can be sent.
  await page.getByRole("radio", { name: /These addresses/ }).check();
  await page.getByLabel("Addresses to send to").fill("a@example.com, not-an-address");
  await expect(page.getByTestId("write-problem")).toHaveText(
    `"not-an-address" isn't an email address.`,
  );
  await expect(page.getByRole("button", { name: "Send to 1 address" })).toBeDisabled();

  // Every subscriber: the button stays off until the count is typed.
  await page.getByRole("radio", { name: /Every subscriber \(2\)/ }).check();
  await expect(panel(page).getByTestId("email-preview-subject")).toHaveText(
    "Oldham County is here",
  );
  await expect(frame.getByText("because you subscribed")).toBeVisible();
  const everyone = page.getByRole("button", { name: "Send to 2 subscribers" });
  await expect(everyone).toBeDisabled();
  await panel(page).getByLabel("Type the number of subscribers to confirm").fill("2");
  await snap(page, testInfo, "admin-write");
  const request = queued(page);
  await everyone.click();
  expect((await request).postDataJSON()).toMatchObject({
    p_kind: "custom",
    p_audience: "subscribers",
    p_to_emails: null,
    p_subject: "Oldham County is here",
    p_test: false,
    p_with_button: true,
    p_expect_count: 2,
  });

  // Queued, but the sender didn't start: the way to start it by hand.
  const notice = page.getByTestId("admin-notice");
  await expect(notice).toContainText("the sender didn't start (the GitHub token isn't set up)");
  await expect(notice.getByRole("link", { name: "Email outbox on GitHub" })).toHaveAttribute(
    "href",
    /actions\/workflows\/email-outbox\.yml$/,
  );
});

test("Sent shows who got an email, and a past one can be written from again", async ({ page }) => {
  await openAdmin(page);
  await page.getByRole("tab", { name: "Sent" }).click();
  const partial = page.locator('[data-testid="admin-job"][data-status="partial"]');
  await expect(partial).toContainText('"Oldham County is on the map" to every subscriber');
  await expect(partial).toContainText("Sent 1 of 2 · 1 failed");
  await expect(partial.getByRole("button", { name: "Send again" })).toBeVisible();

  await partial.getByRole("button", { name: "Who got it" }).click();
  const rows = partial.getByTestId("admin-deliveries").getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Failed");
  await expect(rows.first()).toContainText("550 mailbox full");

  await partial.getByRole("button", { name: "Write from this" }).click();
  await expect(page.getByRole("tab", { name: "Write" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Subject" })).toHaveValue(
    "Oldham County is on the map",
  );
  await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(
    /Switch it on in the Filter tab\.$/,
  );
});
