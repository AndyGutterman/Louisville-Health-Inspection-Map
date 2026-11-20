---
paths:
  - "apps/web/src/Map.jsx"
  - "apps/web/src/Colors.jsx"
  - "apps/web/src/features/map/**"
  - "apps/web/src/features/filters/**"
  - "apps/web/src/hooks/useLatest.js"
  - "apps/web/src/lib/{scoring,dedupe,samePlaceDetection,outsideClick,mapBounds,mapFilters,mapCache,counties,categories,constants,searchText}.js"
  - "packages/core/{categories,grading}.js"
---

# The map, its pins and the filter card

## Will bite you

- **Click-outside handler:** `closeOnOutsideClick` in `features/map/useMapLibre.js` closes the info drawer on any click outside the `KEEP_DRAWER_OPEN` list in `lib/outsideClick.js` (control card, drawer, account panel, table panel, What's New, a few buttons; the rule is `closesDrawer`, tested). Any new floating panel or toggle must get the `data-map-overlay` attribute or be added to that list, or it will close the drawer.
- **Map event handlers are registered once**, when the map loads. They read current state through `useLatest` (`src/hooks/useLatest.js`). Don't add changing values to the map effect's dependency array in `useMapLibre.js`: that rebuilds the map.
- **Same-place detection:** `lib/samePlaceDetection.js` tags both features with each other's info; it never hides or merges pins. The sub-tenant regex must use `\bat\b` style word boundaries (it once contained raw backspace characters, and an older copy matched any name containing "at"). Tests pin this.
- **No "critical" labels:** never decide anything from `critical_yn` (CLAUDE.md, the laws). No red rings.

## How it works

- **Pins and bands:** `lib/scoring.js` (presets loose/balanced/strict, `bandExprs`), colors in `Colors.jsx` (`PIN_COLORS`). These follow the visitor's sliders. Score **badges** don't: one fixed scale everywhere, `scoreBand` in `packages/core/grading.js`, which also has `isFailing`. Don't write those numbers anywhere else.
- **Violation rings:** Louisville amber-red, every other county goldenrod (`features/map/mapLayers.js`).
- **Categories:** `packages/core/categories.js` (the pipeline's coverage report reads it too); a category is a set of (facility type, subtype) pairs. Each pair belongs to exactly one category (tested). `lib/categories.js` re-exports it and adds the Filter tab's state.
- **Same-coordinate pins:** `lib/dedupe.js` collapses to the worst establishment, keeps others searchable.
- **Pan limits:** `lib/mapBounds.js` widens the old fixed box by an amount that scales with the window, so pins under side panels can be panned into view.
- **Map popups** sit under every panel: `.map-container` has `z-index: 0`, so it is its own stacking context.
- **Date filter and map cache constants:** `lib/constants.js`.
- **Counties load on demand:** only Jefferson loads on a first visit. A county that is off is shaded with orange stripes and has a "Tap to load" button on the map (`features/map/useCountyLoadLayer.js`), and a checkbox in the Filter tab's Counties list. `shownCounties` in `Map.jsx` (rules in `lib/counties.js`, remembered in localStorage `lfs_counties`) decides what is loaded, drawn, searched, and listed in Table View and What's New. `useMapFeatures(shown)` reads each county at most once per page and caches it on its own (`lib/mapCache.js`, good until the next daily data load, `DATA_REFRESH_UTC_HOUR`); switching a county off and on never asks the database again. A new county needs `labelAt` in `lib/regions.js`.
- **Categories load on demand:** a first visit has Restaurants, Retail and Kitchens on (`DEFAULT_CATEGORIES` in `lib/categories.js`, the first three tiles), and only those are read for Jefferson: `useMapFeatures(shown, categories)` asks `v_facility_map_pins` for the categories it lacks in one filtered read (`categoryOrFilter`), and caches each category on its own (`jefferson/schools` in `lib/mapCache.js`). Tapping a tile reads that category once; off and on again reads nothing. The choice is remembered (localStorage `lfs_categories`). A place of a category that isn't loaded (opened from What's New, Table View, Saved, a watch area or an email link, or one of the visitor's saved places) gets its pin from one small read (`loadPins`, `fetchPinsById`), and saved places and the open place pass the category filter (`alwaysShow` in `lib/mapFilters.js`). A map search only covers the categories that are on: the search box says "Searching 3 of 8 place types" with a "Search all" button.
- **Jefferson's pins are one read:** `v_facility_map_pins` (migration `20261122000000`), `fetchMapPins` in `api/mapData.js`. There is no fallback: the old one read three whole tables from the browser (removed 2026-11-18). If the read fails, the pages already read stay on the map and the corner indicator offers to try again.
- **Untyped counties:** undated Bullitt pins pass the date filter (dated ones are filtered normally) and always pass the category filter, since they have no facility types (`lib/mapFilters.js` `categoryFilter`; the Filter tab lists Jefferson with the category tiles and the untyped counties below, with a one-line note).
- **Search:** `lib/searchText.js`, used by the map (`search_key` on each pin, built in `lib/dedupe.js`, matched in `lib/mapFilters.js`) and Table View. Case, spacing, punctuation and accents are ignored, and every word must match, so "mcdonalds", "Mc Donald's" and "mc'donalds" all find every McDonald's in both counties. Toggles search names or addresses only.
