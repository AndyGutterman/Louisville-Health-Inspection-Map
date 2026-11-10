# Bullitt County (MVP)

Status: working MVP on the `feat/bullitt-county` branch, not merged. Its job is to show
what Bullitt's data can and can't do, so the design decisions below can be made with
real data on the map.

## Where the data comes from

The [Bullitt County Health Department food page](https://www.bullitthealth.org/food) has
an "Inspection Scores" tab: a drop-down of establishments and a View Inspection button.
That widget is an HTML embed that reads a **public Google Sheet** through the Sheets API.
The pipeline reads the same sheet as plain CSV, which needs no API key:

```
https://docs.google.com/spreadsheets/d/1f5jInKfN7_oGSXy_o0wdYEU1tVwUd5TPP_Uk5H-pTYY/export?format=csv&gid=0
```

(The embed's own API key belongs to the department; using it would spend their quota.
The `gviz` CSV endpoint also works, but it guesses column types and can blank cells, so
the plain export is used.)

One row per establishment, about 250 rows. The page says it is updated weekly.

| Column                | Example                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Establishment Name    | AFC SUSHI @ KROGER #728L                                                                                 |
| Address               | 185 ADAM SHEPHERD PARKWAY                                                                                |
| City                  | SHEPHERDSVILLE (also SHEPHERDSVLLE, MT. WASHINGTON...)                                                   |
| Last Inspection Score | 94 (blank for about 15 places not yet inspected)                                                         |
| Violations            | `PROPER COLD HOLDING TEMPERATURES; Hot and cold water available; adequate pressure; plumbing maintained` |
| Follow-Up Date        | 9/14/2026                                                                                                |
| Follow-Up Score       | 100                                                                                                      |
| Follow-Up Violations  | (same format as Violations)                                                                              |

## How it differs from Louisville's data

| Louisville (ArcGIS)                             | Bullitt (sheet)                                             | MVP handling                                                             |
| ----------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| Establishment ids                               | none                                                        | id = `bullitt-` + hash of name and address                               |
| Every inspection, with dates, back to ~2016     | **only the latest**, with **no date** (follow-ups have one) | history builds up from the first load; latest shows "Date not published" |
| Coordinates for most places                     | addresses only                                              | geocoded (below)                                                         |
| Facility type and subtype                       | none                                                        | category filter hidden for Bullitt                                       |
| A/B/C placards                                  | none                                                        | grade shows "—"                                                          |
| Violation code, description, inspector comments | form item text only, no comments                            | each item is a violation, no comment text                                |

Two quirks of the violation text, handled in `pipeline/regions/bullitt/parse.js`:

- Items are separated by `; `, but some form items contain `; ` themselves ("Hot and
  cold water available; adequate pressure; plumbing maintained"). Splitting on `;` as the
  department's widget does breaks them apart. The parser rejoins them: a piece starting
  lowercase continues the previous item, plus a short list of uppercase ones.
- UPPERCASE items are the inspection form's "foodborne illness risk factor" items, and
  lowercase ones are "good retail practices". The site does **not** use this (see the
  2026-11-09 decision: no critical labels), but it is real information worth deciding on.

## How it is built

- **Database:** `supabase/migrations/20261110000000_bullitt_county.sql` adds
  `bullitt_establishments`, `bullitt_inspections` (every version of a row we have seen),
  `bullitt_snapshots` (a copy of the sheet whenever it changes, not public), and the view
  `v_bullitt_map_feed`. They are separate from `facilities`/`inspections` on purpose: the
  live site reads those everywhere, so Bullitt rows there would go live before the design
  is settled.
- **Pipeline:** `pipeline/regions/bullitt/ingest.js` (run with `npm run bullitt -w pipeline`;
  `npm run bullitt:retry -w pipeline` also retries addresses that failed before. In
  PowerShell, `npm run bullitt -w pipeline -- --flag` drops the flag: PowerShell eats the
  `--`. Quote it as `'--'`).
  It skips everything when the sheet hasn't changed, refuses to run if the sheet suddenly
  has under half the places of the last load, and stops if the columns change.
- **Geocoding:** the same providers as `geocode_missing.js` (Nominatim, then Census, from
  the shared `pipeline/lib/geocode.js`) and the same `geocode_cache` table. Nominatim
  searches only a box around the county, and a third try asks the Census without the town
  (the sheet sometimes has the mailing town). What those miss goes to Kentucky's statewide
  **911 address points** (`pipeline/lib/ky911.js`, public, no key; one point per addressed
  building, so new subdivisions are there first). `pipeline/lib/addressPoints.js` matches
  loosely spelled streets ("HIGH POINTE CT" is High Point Court). A house number with no
  point of its own goes between its neighbours and is stored as `ky911-approx`. The last
  few are placed by hand in `pipeline/regions/bullitt/overrides.json` (provider `manual`;
  instructions are in the file). Every run applies those first, and a test checks that each
  hand-placed pin is inside the county. A match
  outside the county outline is kept but flagged (`geocode_outside_county`).
- **Workflow:** `.github/workflows/bullitt-ingest.yml`, daily at 08:45 UTC. GitHub only
  runs scheduled and manual workflows from `main`, so until this is merged, run it locally.
- **Website:** both counties' pins show together (the County picker is gone). The date
  filter lets Bullitt's undated pins through, and the category filter files them under
  "Other" (`lib/mapFilters.js`). The drawer explains the source. Saved places, watch areas
  and Table View cover Bullitt once `supabase/migrations/20261111000000_both_counties.sql`
  has run. What's New is still Louisville only. County capabilities, agency and data
  sources live in `apps/web/src/lib/regions.js`; the Learn page lists the sources from there.

## Geocoding results (dry run, November 2026)

- 250 places on the sheet; **221 pinned inside the county** (142 by Nominatim, 79 by the
  Census), none outside it.
- **29 not found** by Nominatim and the Census: 3 PO boxes (food trucks and mobile
  vendors, which have no fixed place) and 26 street addresses, mostly in newer
  subdivisions (East Brooke, Keystone Crossing, Plaza Park, Hubbards Crossing) or
  misspelled in the sheet.
- The **911 address points** then matched 21 of the 27 distinct missed addresses: 12
  exactly, 9 placed between neighbouring house numbers. The 6 left: the PO boxes, Peregrine
  Rd (not in the state's data yet), and 4 addresses with no point within 50 house numbers,
  where a guess would be worse than no pin.
- The first dry run found a bug in the shared `stripSuite`: unit words matched the
  start of street names, so "135 NORTH POPLAR" was looked up as "135" and got a wrong
  pin. Fixed for both counties.

## Decisions to make before merging

1. **Dates.** The latest inspection has no date. Options: show "Date not published"
   (MVP); show "on the list since <first time we saw it>" (accurate from the second
   change on, meaningless for the first load); or ask the department to add an
   inspection-date column to the sheet. Asking is the best fix; the sheet is clearly
   maintained by hand.
2. **Date filter.** Louisville defaults to "1 year". Bullitt has no dates, so it is
   hidden. Should undated places count as recent, or only once history builds up?
3. **Which score the pin shows.** The MVP uses the routine inspection's score, like the
   department's "Last Inspection Score". The follow-up score is in the drawer.
4. **Categories.** No facility types. Options: leave them off, guess from names
   ("ELEMENTARY", "SCHOOL", "DAY CARE", "@ KROGER"), or ask the department.
5. **Grades and standards.** Kentucky's satisfactory mark is 85 with no critical
   violation; Louisville layers its A/B/C placard on top. Do Bullitt pins use the same
   red/yellow/green cut-offs? (The MVP does.) What does the Learn page say for Bullitt?
6. **Risk factor vs good retail practice.** The uppercase/lowercase split above. Using it
   would be the first time the site sorts violations by kind; it needs the same care as
   the decision to drop "critical".
7. **One schema or two.** Keep `bullitt_*` tables, or move both counties into shared
   tables with a `region` column (the refactor plan's idea). Shared tables would give
   Bullitt What's New, Table View, saved places and watch areas for free, but every
   Louisville query and pipeline job would need checking first.
8. **Toggle or both at once.** Decided: both at once (November 2026). Undated Bullitt pins
   always pass the date filter (2) and count as "Other" (4).
9. **Geocoding order.** The 911 address points are the county's own records, so they
   could go first instead of last (and could serve Louisville too). The MVP keeps them
   last so pins Nominatim and the Census already placed don't move. Should approximate
   (`ky911-approx`) pins look different on the map? Geoapify was also tried: 3 of 6 sample
   misses found, but two confident wrong answers, so it is not used.

## Known limits

- A re-inspection with exactly the same score and violations as the last one looks like
  no change, so it is not recorded as a new inspection.
- Renaming a place in the sheet makes it a new establishment (ids come from the name).
- Food trucks and other places with a PO Box get no pin.
