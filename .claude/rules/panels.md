---
paths:
  - "apps/web/src/features/drawer/**"
  - "apps/web/src/features/saved/**"
  - "apps/web/src/{AccountPage,WhatsNew}.jsx"
  - "apps/web/src/watchAreaLayer.js"
  - "apps/web/src/lib/{bottomSheet,violationGroups,watchAreaSort,whatsNew}.js"
---

# The info drawer, Saved, What's New and phone layering

- **Info drawer:** `features/drawer/` (`InfoDrawer.jsx` the shell, `InspectionCard.jsx`, `History.jsx`, `useBottomSheet.js`, `useDrawerWidth.js`; repeated citations are merged by `lib/violationGroups.js`). Desktop is a side panel. On phones (max-width 600px) it is a bottom sheet with two heights, peek (about 1.5 history rows) and expanded (about 74% of the screen), dragged by a handle; rules in `lib/bottomSheet.js`. Dragging well below peek, or flinging down from peek, closes it. Swipe-to-close is on; the owner may turn it off.
- **No "critical" labels** in the drawer: every citation is a plain violation (CLAUDE.md, the laws).
- **Records with no map pin:** What's New rows with no coordinates still open the drawer (flagged `noLocation`, shows "No map location on file"), and the map does not move.
- **Phone layering:** `mobileTop` state in Map.jsx ("account" or "drawer"). Opening Saved goes over the map and over any open drawer; tapping a record in Saved opens the drawer on top and replaces any drawer already open; closing the drawer leaves Saved open. Account page z-index is 3300 when on top, 50 otherwise.
- **Header button** says "Saved" (class `header-nav-btn--account`); the panel title still says "My Account". The label was decided (alternatives considered: Watch, Account, My Places, Watchlist, Alerts).
- **Watch areas:** `watchAreaLayer.js` (circles, editor popup with drag handles). Clicking the popup card (not its buttons) opens the Saved panel scrolled to that area (`openWatchPanelRef`, `focusArea`). Default sort in a watch area is "Violations" (most violations first, then failing grade; `lib/watchAreaSort.js`). Watch areas and saved places cover both counties (migration `20261111000000_both_counties.sql`).
- **Limits, to keep reads small:** 3 watch areas per account, 1 to 5 miles, each listing only the 50 places with the most violations (the database sorts and cuts the list); 30 saved places (`CAPS` in `features/saved/limits.js`, `watchAreaLayer.js`, and the database's `enforce_row_cap` triggers, migration `20261123000000_watch_area_limits.sql`). Change all three together.
- **What's New** has three tabs, Latest (`get_latest_inspections`, the same rows as `get_whats_new` by date), Violations (`get_whats_new`, failing first) and Top Scores (`get_top_scores`), listed in `lib/whatsNew.js` `WHATS_NEW_TABS`; all include Bullitt; undated rows say "posted <date>" (`lib/whatsNew.js`).
