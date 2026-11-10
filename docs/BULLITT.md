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

| Louisville (ArcGIS)                                     | Bullitt (sheet)                                             | MVP handling                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Establishment ids                                       | none                                                        | id = `bullitt-` + hash of name and address                                         |
| Every inspection, with dates, back to ~2016             | **only the latest**, with **no date** (follow-ups have one) | history builds up from the first load; dates estimated when a result changes       |
| Coordinates for most places                             | addresses only                                              | geocoded (below)                                                                   |
| Facility type and subtype                               | none                                                        | category filter leaves Bullitt's pins alone                                        |
| A/B/C placards                                          | none                                                        | grade shows "—"                                                                    |
| Violations listed **mostly for failing inspections**    | every marked form item, for every inspection                | no violation rings on Bullitt pins (below)                                         |
| Violation code, description, inspector comments         | form item names only, no comments                           | each item is a violation; a note says they are form items, not the inspector's notes |

Two quirks of the violation text, handled in `pipeline/regions/bullitt/parse.js`:

- Items are separated by `; `, but some form items contain `; ` themselves ("Hot and
  cold water available; adequate pressure; plumbing maintained"). Splitting on `;` as the
  department's widget does breaks them apart. The parser rejoins them: a piece starting
  lowercase continues the previous item, plus a short list of uppercase ones.
- UPPERCASE items are the inspection form's "foodborne illness risk factor" items, and
  lowercase ones are "good retail practices". The site does **not** use this (see the
  2026-11-09 decision: no critical labels), and shows every item in capitals, like
  Louisville's violation names, so the case doesn't hint at severity either.

## Why Bullitt seems to have more violations

It doesn't; the two sources list different things. Measured in November 2026:

| Score band | Louisville inspections (last 12 months) with violations listed | Bullitt routine inspections with items listed |
| ---------- | -------------------------------------------------------------- | --------------------------------------------- |
| 95–99      | 1% (of 5,358)                                                  | 97% (of 119), 2.0 items on average            |
| 85–94      | 28% (of 671)                                                   | 98% (of 46), 5.5 items on average             |
| 1–84       | 80% (of 41)                                                    | 100% (of 1)                                   |

Louisville Metro's violations come from the ArcGIS layer "Inspection Violations of Failed
Restaurants", so a passing Louisville inspection with points off usually shows no
violations at all. Scores are similar (29% of Bullitt routine inspections are a perfect
100, 35% of Louisville's). That's why the map draws violation rings for Louisville only
(`has.rings` in `apps/web/src/lib/regions.js`): with rings, 155 of 242 Bullitt places
were ringed against 5 of 5,738 in Louisville. **The Louisville gap affects the live site
too** (see decision 10).

## How it is built

- **Database:** `supabase/migrations/20261110000000_bullitt_county.sql` adds
  `bullitt_establishments`, `bullitt_inspections` (every version of a row we have seen),
  `bullitt_snapshots` (a copy of the sheet whenever it changes, not public), and the view
  `v_bullitt_map_feed`. `20261111000000_bullitt_estimated_dates.sql` adds two columns to
  the view for estimated dates. They are separate from `facilities`/`inspections` on
  purpose: the live site reads those everywhere, so Bullitt rows there would go live before
  the design is settled.
- **Pipeline:** `pipeline/regions/bullitt/ingest.js` (run with `npm run bullitt -w pipeline`;
  `npm run bullitt:retry -w pipeline` also retries addresses that failed before. In
  PowerShell, `npm run bullitt -w pipeline -- --flag` drops the flag: PowerShell eats the
  `--`. Quote it as `'--'`). It skips everything when the sheet hasn't changed, refuses to
  run if the sheet suddenly has under half the places of the last load, and stops if the
  columns change. `regions/bullitt/versions.js` decides which results are new (tested over
  a week of mocked daily sheets in `tests/bullitt_versions.test.js`).
- **Geocoding:** the same providers as `geocode_missing.js` (Nominatim, then Census, from
  the shared `pipeline/lib/geocode.js`) and the same `geocode_cache` table. Nominatim
  searches only a box around the county, and a third try asks the Census without the town
  (the sheet sometimes has the mailing town). What those miss goes to Kentucky's statewide
  **911 address points** (`pipeline/lib/ky911.js`, public, no key; one point per addressed
  building, so new subdivisions are there first). `pipeline/lib/addressPoints.js` matches
  loosely spelled streets ("HIGH POINTE CT" is High Point Court). A house number with no
  point of its own goes between its neighbours and is stored as `ky911-approx`. The last
  few are placed by hand in `pipeline/regions/bullitt/overrides.json` (provider `manual`),
  using Kentucky's **911 road centerlines** and their house-number ranges. Every run applies
  those first, and a test checks that each hand-placed pin is inside the county. A match
  outside the county outline is kept but flagged (`geocode_outside_county`).
- **Workflow:** `.github/workflows/bullitt-ingest.yml`, daily at 08:45 UTC. GitHub only
  runs scheduled and manual workflows from `main`, so until this is merged, run it locally.
- **Website:** both counties' pins share the map and one filter panel. The category and
  date filters apply per county to what its data has (`has` in `lib/regions.js`), so
  Bullitt's pins stay whatever they say, and the Filter tab says so. Score bands and
  search apply to both. Bullitt's pins load once, when the map view first reaches the
  county or a search starts, and are cached for the session; the opening view stops north
  of Bullitt, so most visits never ask for them. Saving a Bullitt place is off (the
  saved-places table has a foreign key to `facilities`). Table View, What's New and the
  Learn page are still Louisville only.

## Estimated dates

The sheet never dates the latest routine inspection, but the job loads it daily, so a
result that first appears after the first load was posted that day: the inspection was
on or before it. The site shows that as **"By 11/12/2026"** (popup: "(estimated)"; drawer
header: "Date (estimated)"), with a disclaimer in the drawer. Results already on the sheet
at the first load stay "Date not published". `estimatedDate` in
`apps/web/src/lib/bullitt.js` holds the rule; both it and the pipeline's versioning are
tested with mocked data. The date filter still ignores Bullitt (`date` stays null), since
most of its places have no estimate yet.

## Geocoding results (November 2026)

- 250 places on the sheet. First load: **221 pinned inside the county** (142 by Nominatim,
  79 by the Census), none outside it, 29 not found.
- Retry with the **911 address points**: 21 more (12 exact, 9 between neighbouring house
  numbers), so 242 pinned.
- **Hand-placed on the 911 road centerlines** (`overrides.json`): 150 Brooks Way (two
  places), 321 East Brooke Pkwy and 156 East Brooke Pointe Dr, so 246 once the job runs.
- **Left off the map:** the 2 PO boxes (food trucks), and 2 addresses on residential
  streets with no public listing (296 Wood Creek Dr, 127 Peregrine Rd), most likely a food
  truck's or home vendor's base. Their coordinates are in `overrides.json` if that changes.
- The first dry run found a bug in the shared `stripSuite`: unit words matched the
  start of street names, so "135 NORTH POPLAR" was looked up as "135" and got a wrong
  pin. Fixed for both counties.

## Decisions to make before merging

1. **Dates.** The MVP estimates dates from the day a result first appears ("By ...").
   Keep that, or ask the department to add an inspection-date column (the best fix; the
   sheet is clearly maintained by hand)?
2. **Date filter.** Bullitt's pins ignore it. Once most places have an estimate, should
   the filter use estimates?
3. **Which score the pin shows.** The MVP uses the routine inspection's score, like the
   department's "Last Inspection Score". Louisville's header shows the newest scored
   inspection, follow-ups included, so for consistency a newer follow-up (Cracker Barrel:
   routine 84, follow-up 95) could win.
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
8. **Both counties at once.** Done in the MVP (it replaced the county picker). Keep it, or
   add a way to hide one county?
9. **Geocoding.** The 911 address points and road centerlines are the counties' own
   records, so they could go first instead of last, and could serve Louisville too (the
   state layer has 449,785 Jefferson points). Centerline interpolation could replace the
   hand-placed pins. Should approximate pins look different? (Geoapify was tried: 3 of 6
   sample misses found, but two confident wrong answers, so it is not used.)
10. **Louisville's missing violations (live site).** About 95% of Louisville inspections
    with points off show no violations, because the open data only lists them for failing
    ones. At least the drawer could say so on those inspections; better, find a source
    with every violation.
11. **Home addresses.** Places whose address is a residence (food trucks, home vendors)
    are left off the map. Keep that rule?

## Known limits

- A re-inspection with exactly the same score and violations as the last one looks like
  no change, so it is not recorded as a new inspection, and gets no estimated date.
- A correction to a result (a typo fixed in the sheet) looks like a new inspection and gets
  an estimated date.
- Renaming a place in the sheet makes it a new establishment (ids come from the name).
- Food trucks and other places with a PO Box get no pin.
