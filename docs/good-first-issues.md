# Good first issues

Ready to paste into GitHub issues. Each one is small, self-contained and points at the code.

1. **A facility type is listed under two categories.**
   `(610, 73)` is in both Retail and Other / Unknown in `src/lib/categories.js`. Because the category filter works on these pairs, turning Retail off leaves those places visible while Other is on. Decide which category it belongs to, remove the duplicate, and delete `.fails` from the matching test in `categories.test.js`.

2. **Replace four copies of the media-query hook with one.**
   `FilterSearch.jsx` (`useMedia`), `ScoreThreshold.jsx` and `InfoDrawer.jsx` (`useIsMobile`) and `Map.jsx` (`useMediaQuery`) each define their own. Note the breakpoints differ (600px in the drawer, 640px in the sliders). Create `src/hooks/useMediaQuery.js`, decide on one phone breakpoint, and use it everywhere.

3. **Use one date formatter.**
   `InfoDrawer.jsx` (`formatDateSafe`), `WhatsNew.jsx` (`formatDate`) and `WatchlistTab.jsx` (`fmtDate`) duplicate what `src/lib/dates.js` already does. Switch them over and add test cases if their behaviour differs.

4. **Fix invalid CSS in `FeedbackModal.jsx`.**
   `.fb-trap` uses `tab-index` and `aria-hidden` as CSS properties (they are HTML attributes, and the element already sets them), and the select's chevron data URI has a stray `<` (`%3C%3C/svg`), so it probably doesn't render.

5. **Move CSS-in-JS strings into `.css` files.**
   `LearnPage.jsx`, `WhatsNew.jsx`, `WatchlistTab.jsx`, `AccountPage.jsx`, `AddressPicker.jsx` and `FeedbackModal.jsx` each carry their stylesheet in a template string. One component per PR, with no visual change.

6. **Fix the `react-hooks/exhaustive-deps` warnings.**
   `npm run lint` reports nine, in `Map.jsx`, `TableView.jsx` and `WhatsNew.jsx`. Each one is a possible stale-closure bug. Fix one file per PR and explain why the dependency is or isn't needed.

7. **Code-split the heavy pages.**
   The production bundle is about 1.4 MB. Load `LearnPage`, `TableView` and `FeedbackModal` with `React.lazy` so the map loads first.

8. **Test the address search.**
   Move `search()` and the bounds filter out of `AddressPicker.jsx` into `src/lib/geocode.js` and cover the response mapping and the "inside Louisville Metro" check with Vitest.
