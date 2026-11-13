# Manual smoke test

Run this before merging anything that touches `Map.jsx`, the drawer, the filters or What's New.

Parts of steps 1, 4 and 9 are automated in `apps/web/e2e/` (`npm run e2e`, and on every pull request), along with the phone drawer's peek/expanded drag. Those tests use made-up data and never click map pins, so walk the full list by hand for anything they don't cover.
It takes about five minutes. Do it once on desktop and once on a phone-sized window.

1. **Load.** The map appears with pins, and the splash screen goes away.
2. **Pin click.** Click a pin. The popup shows, and the info drawer opens with score, date, grade and inspection history.
3. **Expand a visit.** Click "N violations" on an inspection. The violation list opens.
4. **Filters.** Open Filter. Toggle one category off and on, then use All off / All on. Pins update each time.
5. **Pin colours.** Switch Red, Yellow, Green and N/A off and on.
6. **Score thresholds.** Open Adjust, try Loose / Balanced / Strict, then drag a handle.
7. **Date range.** Change "1 year" to another range. Pin count changes.
8. **Search.** Type a restaurant name in the header search. The map jumps to it.
9. **What's New.** Open it: Latest is selected, newest first. Switch to Violations (failing first) and Top Scores, click a row. Drag the panel wide on desktop: the three tabs become three columns. Click a row with _Location unavailable_: the drawer opens and the map does not move.
10. **Table view.** Open it, click a row (map flies to it), then resize or close the panel.
11. **Account.** Sign in with an email code, save a place to the watchlist, add a watch area, then sign out.
12. **Learn page.** Open Learn, search the violation database, return to the map.
13. **Feedback.** Open the feedback form and close it without submitting.
14. **County picker.** Pick Bullitt: the map flies to Bullitt County, only its pins show, and the date filter and category tiles go away. Click a pin: the popup and drawer show the inspection date (or "Date not published" when the portal hasn't answered for 3 days and the county's sheet is the source), with no save button. Pick Jefferson again: everything comes back.
15. **Console.** Open dev tools. No red errors during any of the above.
16. **Counties.** On a first visit only Jefferson has pins. Zoom out: Bullitt and Oldham are shaded with orange stripes and each has a "Tap to load" button. Tap one: its pins appear and the stripes go. In Filter, the Counties list shows the same three with a checkbox; uncheck and recheck a county and its pins come back at once (no "Loading…"). Search, Table View and What's New only show the counties that are checked. On an iPhone, the map buttons and the checkboxes are easy to hit with a thumb.
