// End-to-end smoke tests (e2e/*.spec.js). Run with `npm run e2e` from the repo root.
//
// BASE_URL set (CI against a Netlify deploy preview): test that site as is.
// BASE_URL unset (local, or CI fallback): build the site and serve it with `vite preview`.
//
// Kept apart from `npm test` (Vitest only picks up src/**/*.test.js) so unit tests stay fast.
import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "";
const LOCAL_URL = "http://localhost:4173";

// Claude Code cloud sessions can't download Playwright's own browser, but come with
// Chrome at CHROME_PATH. Use that there; everywhere else, Playwright's Chromium.
const CLOUD_CHROME = process.env.CLAUDE_CODE_REMOTE === "true" ? process.env.CHROME_PATH : "";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.js",
  outputDir: "./e2e/test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./e2e/playwright-report" }]],
  use: {
    baseURL: BASE_URL || LOCAL_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(CLOUD_CHROME ? { launchOptions: { executablePath: CLOUD_CHROME } } : {}),
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      // 412px wide: under the 600px breakpoint where the info drawer becomes a bottom sheet.
      name: "phone",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: LOCAL_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        // The tests answer every Supabase call themselves (e2e/support/mockSupabase.js),
        // so the build only needs placeholders. The same on a laptop, in the cloud and in CI.
        env: {
          VITE_SUPABASE_URL: "https://example.supabase.co",
          VITE_SUPABASE_ANON_KEY: "e2e-placeholder",
        },
      },
});
