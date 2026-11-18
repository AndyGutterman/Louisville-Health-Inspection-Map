// Spanish (issue #7): the language picker, what it translates, and what it leaves as
// published (place names, the health department's own text).
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openApp } from "./support/app.js";
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
