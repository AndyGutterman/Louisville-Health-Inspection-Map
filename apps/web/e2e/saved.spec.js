// The Saved panel's watch areas (WatchlistTab.jsx). The panel and the map's circles share
// one list (features/map/useWatchlist.js), so a change in one never makes the other read
// the areas from the database again.
import { test, expect } from "@playwright/test";
import { mockAuth, openApp, signIn, TEST_USER } from "./support/app.js";
import { snap } from "./support/screenshots.js";

const AREA = {
  id: "a0000000-0000-4000-8000-000000000001",
  user_id: TEST_USER.id,
  label: "Home",
  center_address: "500 W Jefferson St, Louisville",
  center_lat: 38.2542,
  center_lon: -85.7594,
  radius_miles: 2,
  created_at: "2026-11-01T12:00:00Z",
};
const ZONE_PLACE = {
  establishment_id: "100002",
  name: "Zone Test Diner",
  address: "510 W Jefferson St",
  score: 82,
  grade: "C",
  inspection_date: "2026-10-20",
  violations_6mo: 3,
  failing: false,
  distance_mi: 0.1,
};

test("changing a watch area's radius in Saved re-reads only that area's places", async ({
  page,
}, testInfo) => {
  await mockAuth(page);
  const { requested } = await openApp(page, {
    answers: {
      watchlist_areas: [AREA],
      v_watchlist_with_latest: [],
      "rpc/watch_zone_places": [ZONE_PLACE],
    },
  });
  await page.locator(".header-nav-btn--login").click();
  await signIn(page);
  await page.getByRole("button", { name: "Saved" }).click();

  const area = page.locator(`[data-area-id="${AREA.id}"]`);
  await expect(area).toContainText("Home");
  await expect(area).toContainText("1 restaurant in zone");
  await expect(area).toContainText(ZONE_PLACE.name);

  const before = requested.length;
  const saved = page.waitForRequest(
    (r) => r.method() === "PATCH" && r.url().includes("/rest/v1/watchlist_areas"),
  );
  await area.getByRole("button", { name: "5 mi" }).click();
  expect((await saved).postDataJSON()).toEqual({ radius_miles: 5 });

  await expect(area.getByRole("button", { name: "5 mi" })).toHaveClass(/\bon\b/);
  await expect(area).toContainText(ZONE_PLACE.name); // the area's places, read again
  await snap(page, testInfo, "saved-watch-area-radius");

  const after = requested.slice(before);
  // One write to the area and one read of its places. The map's circles take the new
  // radius from the panel: no second read of the areas.
  expect(after.filter((p) => p === "watchlist_areas")).toEqual(["watchlist_areas"]);
  expect(after.filter((p) => p === "rpc/watch_zone_places")).toEqual(["rpc/watch_zone_places"]);
});
