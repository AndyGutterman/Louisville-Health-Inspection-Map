// Accessibility: axe-core checks each main view against WCAG 2.2 A and AA (issue #8).
// What axe can't judge (keyboard paths, focus order, plain language) is in
// docs/ACCESSIBILITY.md.
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mockAuth, openApp, openDrawerFromWhatsNew, openWhatsNew, signIn } from "./support/app.js";
import { byEid, PINNED_EID } from "./support/fixtures.js";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// The neon "LOUISVILLE FOOD SAFE" in the header is the site's logo: WCAG 1.4.3 exempts
// text that is part of a logo or brand name from the contrast minimum, so axe's contrast
// check skips it (every other check still covers it).
const LOGO = ".brand";

// The violations on the page as it is now, one line each, for a readable failure. A
// contrast failure also says the colours and the ratio it found.
async function audit(page) {
  // One after the other: axe can't run twice on a page at once.
  const all = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["color-contrast"])
    .analyze();
  const contrast = await new AxeBuilder({ page })
    .withRules(["color-contrast"])
    .exclude(LOGO)
    .analyze();
  const violations = [...all.violations, ...contrast.violations];
  if (process.env.A11Y_ALL) {
    // Every failing element, not just the first of each kind (A11Y_ALL=1 npm run e2e).
    for (const v of violations) {
      for (const n of v.nodes) {
        const c = n.any?.find((a) => a.data?.contrastRatio)?.data;
        console.log(
          `  ${v.id}: ${n.target.join(" ")}${c ? ` ${c.fgColor} on ${c.bgColor} ${c.contrastRatio}` : ""}`,
        );
      }
    }
  }
  return violations.map((v) => {
    const node = v.nodes[0];
    const c = node.any?.find((a) => a.data?.contrastRatio)?.data;
    const colours = c ? ` [${c.fgColor} on ${c.bgColor}: ${c.contrastRatio}:1]` : "";
    return `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length}× e.g. ${node.target.join(" ")}${colours}`;
  });
}

const VIEWS = {
  "the map": async () => {},
  "the open filter card": async (page) => {
    await page.getByRole("button", { name: "Expand controls" }).click();
    await page.getByRole("tab", { name: "Filter" }).click();
  },
  "What's New": async (page) => openWhatsNew(page),
  "the info drawer": async (page) => {
    await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);
    await page.getByRole("button", { name: "Close What's New" }).click();
  },
  "Table View": async (page) => {
    await page.getByRole("button", { name: "Open table view" }).click();
    await expect(page.getByTestId("table-row").first()).toBeVisible();
  },
  "the sign-in form": async (page) => {
    await page.locator(".header-nav-btn--login").click();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  },
  "the feedback form": async (page) => {
    await page.getByRole("button", { name: "Feedback" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  },
};

for (const [name, open] of Object.entries(VIEWS)) {
  test(`a11y: ${name}`, async ({ page }) => {
    await openApp(page);
    await open(page);
    expect(await audit(page)).toEqual([]);
  });
}

test("a11y: the Learn page", async ({ page }) => {
  await openApp(page, { path: "/?page=learn" });
  await expect(page.locator(".ln-page")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("a11y: the privacy page", async ({ page }) => {
  await openApp(page, { path: "/?page=privacy" });
  await expect(page.getByTestId("privacy-page")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("a11y: the Saved panel, signed in", async ({ page }) => {
  await mockAuth(page);
  await openApp(page);
  await page.locator(".header-nav-btn--login").click();
  await signIn(page);
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByTestId("digest-toggle")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

test("a11y: the pin control center, as an admin", async ({ page }) => {
  await mockAuth(page);
  await openApp(page, { path: "/?page=pins", answers: { "rpc/is_admin": true } });
  await page.getByTestId("admin-gate").getByRole("button", { name: "Log in" }).click();
  await signIn(page);
  await expect(page.getByTestId("place-editor")).toBeVisible();
  expect(await audit(page)).toEqual([]);
});

// The same views in Spanish: axe checks the translated text's contrast, names and lengths
// (a longer label can overflow), and the page's lang.
test.describe("a11y in Spanish", () => {
  test.use({ locale: "es-MX" });

  const SPANISH_VIEWS = {
    "the map": async () => {},
    "the open filter card": async (page) => {
      await page.getByRole("button", { name: "Expandir controles" }).click();
      await page.getByRole("tab", { name: "Filtrar" }).click();
    },
    "Table View": async (page) => {
      await page.getByRole("button", { name: "Abrir la vista de tabla" }).click();
      await expect(page.getByTestId("table-row").first()).toBeVisible();
    },
    "the sign-in form": async (page) => {
      await page.locator(".header-nav-btn--login").click();
      await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
    },
    "the feedback form": async (page) => {
      await page.getByRole("button", { name: "Comentarios" }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  };
  for (const [name, open] of Object.entries(SPANISH_VIEWS)) {
    test(`a11y (es): ${name}`, async ({ page }) => {
      await openApp(page);
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      await open(page);
      expect(await audit(page)).toEqual([]);
    });
  }

  test("a11y (es): the Learn page", async ({ page }) => {
    await openApp(page, { path: "/?page=learn" });
    await expect(page.locator(".ln-page")).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });

  test("a11y (es): the privacy page", async ({ page }) => {
    await openApp(page, { path: "/?page=privacy" });
    await expect(page.getByTestId("privacy-page")).toBeVisible();
    expect(await audit(page)).toEqual([]);
  });
});
