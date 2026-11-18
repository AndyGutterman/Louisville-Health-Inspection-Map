// Accessibility, part 2 (docs/ACCESSIBILITY.md): what axe can't judge. Reflow at 320px and
// at 200% zoom (1.4.10, 1.4.4), reduced motion (2.3.3), focus in and out of dialogs (2.4.3),
// and the size of tap targets (2.5.8).
import { test, expect } from "@playwright/test";
import { mockAuth, openApp, openDrawerFromWhatsNew, signIn } from "./support/app.js";
import { byEid, PINNED_EID } from "./support/fixtures.js";

// ── Views, opened the same way for each check ───────────────────────────────────────────
const VIEWS = {
  "the map": async () => {},
  "the open filter card": async (page) => {
    await page.getByRole("button", { name: "Expand controls" }).click();
    await page.getByRole("tab", { name: "Filter" }).click();
  },
  "What's New": async (page) => {
    await page.getByRole("button", { name: "What's New", exact: true }).click();
    await expect(page.getByTestId("whats-new-panel")).toBeVisible();
  },
  "the info drawer": async (page) => {
    await openDrawerFromWhatsNew(page, PINNED_EID, byEid(PINNED_EID).name);
    await page.getByRole("button", { name: "Close What's New" }).click();
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
const PAGES = { "the Learn page": "/?page=learn", "the privacy page": "/?page=privacy" };

async function openView(page, name) {
  if (PAGES[name]) await openApp(page, { path: PAGES[name] });
  else {
    await openApp(page);
    await VIEWS[name](page);
  }
}
const ALL_VIEWS = [...Object.keys(VIEWS), ...Object.keys(PAGES)];

// ── Reflow: no sideways scrolling at 320px wide, or at 200% zoom ────────────────────────
// 200% zoom on a 1280px window is a 640 x 360 CSS-pixel page. Table View is exempt (WCAG
// allows two-dimensional scrolling for data tables), and the map itself is a canvas.
// The real name font ("Tilt Neon") comes from Google Fonts, which the tests may not reach, and
// is wider than the fallback: so the name is also measured in a much wider font.
const WIDE_NAME =
  ".brand > span { font-family: 'DejaVu Sans', Verdana, sans-serif !important; font-weight: 800 !important; letter-spacing: 0.08em !important; }";
const overflow = (page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          r.width > 0 &&
          r.right > width + 1 &&
          style.position !== "fixed" &&
          !el.closest(".maplibregl-map, .maplibregl-canvas-container, [aria-hidden=true]") &&
          !el.closest("[data-scrolls]")
        );
      })
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
    return { scrollWidth: document.documentElement.scrollWidth, width, wide };
  });

for (const [label, size] of [
  ["320px wide", { width: 320, height: 640 }],
  ["200% zoom", { width: 640, height: 360 }],
]) {
  test.describe(`reflow at ${label}`, () => {
    test.use({ viewport: size });
    for (const name of ALL_VIEWS) {
      test(`${name} has no sideways scrolling`, async ({ page }) => {
        await openView(page, name);
        await page.addStyleTag({ content: WIDE_NAME });
        const o = await overflow(page);
        expect(
          o.scrollWidth,
          `page is ${o.scrollWidth}px wide; wide: ${o.wide.join(", ")}`,
        ).toBeLessThanOrEqual(o.width);
        expect(o.wide, "elements past the right edge").toEqual([]);
      });
    }

    test("the header's buttons and the filter card stay on screen", async ({ page }) => {
      await openApp(page);
      for (const name of ["Learn", "Feedback"]) {
        const box = await page.getByRole("button", { name }).first().boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      }
    });
  });
}

// ── Reduced motion ──────────────────────────────────────────────────────────────────────
const longestMotion = (page) =>
  page.evaluate(() => {
    const seconds = (v) =>
      Math.max(
        ...v
          .split(",")
          .map((s) => (s.trim().endsWith("ms") ? parseFloat(s) / 1000 : parseFloat(s) || 0)),
      );
    let longest = 0;
    for (const el of document.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      longest = Math.max(longest, seconds(s.transitionDuration), seconds(s.animationDuration));
    }
    return longest;
  });

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("panels and the drawer don't slide or fade", async ({ page }) => {
    await openApp(page);
    await VIEWS["the info drawer"](page);
    expect(await longestMotion(page)).toBeLessThan(0.01);
    await page.getByRole("button", { name: "Expand controls" }).click();
    await page.getByRole("tab", { name: "Filter" }).click();
    expect(await longestMotion(page)).toBeLessThan(0.01);
  });
});

test("without that setting, the site does animate (the check above means something)", async ({
  page,
}) => {
  await openApp(page);
  await VIEWS["the info drawer"](page);
  expect(await longestMotion(page)).toBeGreaterThan(0.05);
});

// ── Focus into and back out of dialogs ──────────────────────────────────────────────────
const inside = (page, selector) =>
  page.evaluate(
    (s) => document.querySelector(s)?.contains(document.activeElement) ?? false,
    selector,
  );

for (const [name, open, box, closer] of [
  [
    "the feedback form",
    async (p) => p.getByRole("button", { name: "Feedback" }),
    ".fb-modal",
    "Close",
  ],
  ["the sign-in form", async (p) => p.locator(".header-nav-btn--login"), ".ln-modal", "Close"],
]) {
  test(`${name}: focus moves in, stays in, and returns to the button that opened it`, async ({
    page,
  }) => {
    await openApp(page);
    const opener = await open(page);
    await opener.focus();
    await opener.press("Enter");
    await expect(page.locator(box)).toBeVisible();
    expect(await inside(page, box), "focus starts inside").toBe(true);

    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await inside(page, box), `Tab ${i + 1} stays inside`).toBe(true);
    }
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inside(page, box), `Shift+Tab ${i + 1} stays inside`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(page.locator(box)).toHaveCount(0);
    await expect(opener).toBeFocused();

    // And the close button does the same.
    await opener.press("Enter");
    await page
      .locator(box)
      .getByRole("button", { name: new RegExp(closer, "i") })
      .first()
      .click();
    await expect(page.locator(box)).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

test("the sign-in form names itself as a dialog", async ({ page }) => {
  await openApp(page);
  await page.locator(".header-nav-btn--login").click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
});

// ── Tap targets of at least 24 x 24 CSS pixels (2.5.8) ──────────────────────────────────
// Inline links inside a sentence are exempt, as is anything inside the map's canvas.
const smallTargets = (page) =>
  page.evaluate(() => {
    const SELECTOR =
      "button, a[href], input:not([type=hidden]):not(.fb-trap input), select, summary, [role=button], [role=tab], [role=switch], [role=checkbox]";
    const out = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === "hidden") continue;
      if (el.closest("[aria-hidden=true], .fb-trap")) continue;
      if (el.matches("input[type=checkbox], input[type=radio]") && el.closest("label")) continue; // the label is the target
      if (el.tagName === "A" && style.display === "inline") continue; // in a sentence: exempt
      if (el.closest(".maplibregl-ctrl-attrib")) continue; // MapLibre's own credit links
      // offsetWidth/Height: the layout size, so a panel still scaling in doesn't read as small.
      const w = el.offsetWidth || r.width;
      const h = el.offsetHeight || r.height;
      if (w < 23.5 || h < 23.5) {
        out.push(
          `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0] || "-"} ${Math.round(w)}x${Math.round(h)} "${(el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 24)}"`,
        );
      }
    }
    return out;
  });

test.describe("tap targets", () => {
  for (const name of ALL_VIEWS) {
    test(`${name}: every control is at least 24px`, async ({ page }) => {
      await openView(page, name);
      expect(await smallTargets(page)).toEqual([]);
    });
  }

  test("the Saved panel, signed in", async ({ page }) => {
    await mockAuth(page);
    await openApp(page);
    await page.locator(".header-nav-btn--login").click();
    await signIn(page);
    await page.getByRole("button", { name: "Saved" }).click();
    await expect(page.getByTestId("digest-toggle")).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
  });

  test("Table View", async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Open table view" }).click();
    await expect(page.getByTestId("table-row").first()).toBeVisible();
    expect(await smallTargets(page)).toEqual([]);
  });
});
