# Manual smoke test

Run this before merging anything that touches `Map.jsx`, the drawer, the filters or What's New.
It takes about five minutes. Do it once on desktop and once on a phone-sized window.

1. **Load.** The map appears with pins, and the splash screen goes away.
2. **Pin click.** Click a pin. The popup shows, and the info drawer opens with score, date, grade and inspection history.
3. **Expand a visit.** Click "N violations" on an inspection. The violation list opens.
4. **Filters.** Open Filter. Toggle one category off and on, then use All off / All on. Pins update each time.
5. **Pin colours.** Switch Red, Yellow, Green and N/A off and on.
6. **Score thresholds.** Open Adjust, try Loose / Balanced / Strict, then drag a handle.
7. **Date range.** Change "1 year" to another range. Pin count changes.
8. **Search.** Type a restaurant name in the header search. The map jumps to it.
9. **What's New.** Open it, switch between Violations and Top Scores, click a row. Click a row with *Location unavailable*: the drawer opens and the map does not move.
10. **Table view.** Open it, click a row (map flies to it), then resize or close the panel.
11. **Account.** Sign in with an email code, save a place to the watchlist, add a watch area, then sign out.
12. **Learn page.** Open Learn, search the violation database, return to the map.
13. **Feedback.** Open the feedback form and close it without submitting.
14. **Console.** Open dev tools. No red errors during any of the above.
