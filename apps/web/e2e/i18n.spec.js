// Spanish (issue #7): the language picker, what it translates, and what it leaves as
// published (place names, the health department's own text).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAuth, openApp, signIn, TEST_USER } from "./support/app.js";
import { byEid, PINNED_EID } from "./support/fixtures.js";
import { snap } from "./support/screenshots.js";

test("picking Español translates the site, keeps place names, and is remembered", async ({
  page,
}, testInfo) => {
  await openApp(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByTestId("language-picker").selectOption("es");

  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByPlaceholder("Buscar en el mapa")).toBeVisible();
  await expect(page.getByRole("button", { name: "Comentarios" })).toBeVisible();

  // What's New and the drawer, in Spanish; the place's name as the health department has it.
  await page.getByRole("button", { name: "Novedades", exact: true }).click();
  await expect(page.getByRole("button", { name: "Recientes" })).toBeVisible();
  await page.locator(`[data-testid="whats-new-row"][data-eid="${PINNED_EID}"]`).click();
  const drawer = page.getByTestId("info-drawer");
  await expect(drawer.getByText(byEid(PINNED_EID).name, { exact: true })).toBeVisible();
  await expect(drawer.getByText("Puntuación", { exact: true })).toBeVisible();
  await expect(drawer.getByText("Historial de inspecciones")).toBeVisible();
  await expect(page.locator(".maplibregl-popup")).toContainText("Puntuación: 82 (C)");
  await snap(page, testInfo, "spanish-drawer");

  // A second visit opens in Spanish.
  await page.reload();
  await expect(page.getByTestId("splash-screen")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByPlaceholder("Buscar en el mapa")).toBeVisible();
});

test.describe("a browser set to Spanish", () => {
  test.use({ locale: "es-MX" });

  test("opens in Spanish, and English is one pick away", async ({ page }) => {
    await openApp(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByPlaceholder("Buscar en el mapa")).toBeVisible();
    await page.getByTestId("language-picker").selectOption("en");
    await expect(page.getByPlaceholder("Search map")).toBeVisible();
  });

  test("passes axe's WCAG checks in Spanish", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Novedades", exact: true }).click();
    await page.locator(`[data-testid="whats-new-row"][data-eid="${PINNED_EID}"]`).click();
    await expect(page.getByTestId("info-drawer").getByText("FOLLOWUP")).toBeVisible();
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .exclude(".brand") // the logo: exempt from contrast (docs/ACCESSIBILITY.md)
      .analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes[0].target.join(" ")}`)).toEqual([]);
  });
});

// ── The picker: flags, in the top left of every page ────────────────────────────────────

test("the picker is a flag in the top left, beside the search box, and says its name on hover", async ({
  page,
}) => {
  await openApp(page);
  const flag = page.getByTestId("language-flag");
  await expect(flag).toHaveAttribute("title", "English");
  await expect(flag.locator("svg.flag")).toBeVisible();
  // The native list under it keeps the accessible name and each language by its own name.
  const select = page.getByTestId("language-picker");
  await expect(select).toHaveAccessibleName("Language");
  await expect(select.locator("option")).toHaveText(["English", "Español"]);
  await expect(select.locator("option[value=es]")).toHaveAttribute("lang", "es");

  const flagBox = await flag.boundingBox();
  const searchBox = await page.getByPlaceholder("Search map").boundingBox();
  expect(flagBox.x).toBeLessThan(searchBox.x); // left of the search box...
  expect(flagBox.x).toBeLessThan(60); // ...at the left edge of the window
  expect(
    Math.abs(flagBox.y + flagBox.height / 2 - (searchBox.y + searchBox.height / 2)),
  ).toBeLessThan(8); // on its row

  await select.selectOption("es");
  await expect(flag).toHaveAttribute("title", "Español");
  await expect(flag).toHaveAttribute("data-lang", "es");
  await expect(select).toHaveAccessibleName("Idioma");
});

for (const [name, path] of [
  ["the Learn page", "/?page=learn"],
  ["the privacy page", "/?page=privacy"],
]) {
  test(`the flag is in the same top-left spot on ${name}`, async ({ page }) => {
    await openApp(page);
    const onMap = await page.getByTestId("language-flag").boundingBox();
    await openApp(page, { path });
    const flag = page.getByTestId("language-flag");
    await expect(flag).toBeVisible();
    const here = await flag.boundingBox();
    expect(Math.abs(here.x - onMap.x)).toBeLessThan(2);
    expect(Math.abs(here.y - onMap.y)).toBeLessThan(2);
    const back = await page.getByRole("button", { name: "Back to the map" }).boundingBox();
    expect(here.x).toBeLessThan(back.x);
  });
}

// ── The weekly email's language ─────────────────────────────────────────────────────────

const SUBSCRIBER = (language) => ({
  profiles: [{ id: TEST_USER.id, alert_frequency: "weekly", language }],
});

async function openSignedIn(page, language) {
  await mockAuth(page);
  await openApp(page, { answers: SUBSCRIBER(language) });
  await page.locator(".header-nav-btn--login").click();
  await signIn(page);
}

test("a subscriber whose email is in English is offered it in Spanish after switching, once", async ({
  page,
}, testInfo) => {
  await openSignedIn(page, "en");
  await expect(page.getByTestId("digest-language-offer")).toHaveCount(0);
  const saves = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/rest/v1/profiles")) saves.push(r.postData());
  });
  await page.getByTestId("language-picker").selectOption("es");
  const offer = page.getByTestId("digest-language-offer");
  await expect(offer).toContainText("Español");
  await snap(page, testInfo, "digest-language-offer");
  await offer.getByRole("button", { name: "Sí" }).click();
  await expect(offer).toHaveCount(0);
  expect(saves.some((b) => b?.includes('"language":"es"'))).toBe(true);
});

test("no offer to a signed-out visitor", async ({ page }) => {
  await openApp(page);
  await page.getByTestId("language-picker").selectOption("es");
  await expect(page.getByTestId("digest-language-offer")).toHaveCount(0);
});

test("no offer to a signed-in account that isn't subscribed", async ({ page }) => {
  await mockAuth(page);
  await openApp(page, {
    answers: { profiles: [{ id: TEST_USER.id, alert_frequency: "off", language: "en" }] },
  });
  await page.locator(".header-nav-btn--login").click();
  await signIn(page);
  const read = page.waitForResponse((r) => r.url().includes("/rest/v1/profiles"));
  await page.getByTestId("language-picker").selectOption("es");
  await read;
  await expect(page.getByTestId("digest-language-offer")).toHaveCount(0);
});

test("the Saved panel offers the email in the site's language, to subscribers only", async ({
  page,
}) => {
  await openSignedIn(page, "en");
  await page.getByTestId("language-picker").selectOption("es");
  await page
    .getByTestId("digest-language-offer")
    .getByRole("button", { name: "No, gracias" })
    .click();
  await page.getByRole("button", { name: "Guardados" }).click();
  const row = page.getByTestId("digest-language-row");
  await expect(row).toContainText("English");
  await row.getByRole("button", { name: /Español/ }).click();
  await expect(row).toHaveCount(0);
});

test("someone who signs up from the Spanish site gets Spanish emails", async ({ page }) => {
  const saves = [];
  page.on("request", (r) => {
    if (r.method() === "PATCH" && r.url().includes("/rest/v1/profiles")) saves.push(r.postData());
  });
  await mockAuth(page);
  await openApp(page);
  await page.getByTestId("language-picker").selectOption("es");
  await page.locator(".header-nav-btn--login").click();
  await page.getByPlaceholder("you@example.com").fill(TEST_USER.email);
  await page.getByRole("button", { name: "Enviarme un código" }).click();
  const step = page.getByTestId("sign-in-code-step");
  await step.getByLabel("Código de acceso").fill("123456");
  await step.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(step).toHaveCount(0);
  await expect.poll(() => saves.some((b) => b?.includes('"language":"es"'))).toBe(true);
});
