# More counties, from Kentucky's inspection portal

Status (2026-11-12): the pipeline reads a county from the portal and **stores** it in the
`portal_*` tables, daily (`pipeline/regions/kyportal/`, `portal-ingest.yml`). Nothing is
shown on the site yet. Oldham County is first. The steps are at the end.

## Which source for which county

The rule: a county keeps the source it has unless the portal is **faster** (posts results
sooner) or has **more**, and no county loses its old source: it stays as the fallback.

| County    | Source                                        | Why                                                                                                                                      |
| --------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Jefferson | ArcGIS (Louisville Metro), unchanged          | As fresh as the portal (its newest rows match the Courier-Journal's), plus history, types, coordinates; one load, not 9                  |
| Bullitt   | both: the sheet, and the portal since 11/2026 | Same 250 places and ids; the portal has dates and posts sooner (3 results dated 11/12 not on the sheet yet). The sheet stays as fallback |
| Oldham    | the portal                                    | The only online source (the health department links to it)                                                                               |

## The source

County health departments across Kentucky link to one statewide page for their scores
(Oldham's ["View Food Scores"](https://oldhamcountyhealthdepartment.org/environmental/)
button goes there). It is run by Custom Data Processing for the state:

```
https://public.cdpehs.com/KYEnvPBL/VW_PUBLIC_EST_INSP/ShowVW_PUBLIC_EST_INSPTable.aspx?County=<n>
```

`n` is the county's place in the alphabetical list of Kentucky's 120 counties: Adair 1,
Bullitt 15, Fayette 34, Jefferson 56, Oldham 93, Woodford 120. Every number answers
(checked November 2026: Oldham 336 rows, Bullitt 250, Jefferson 8,330, Fayette 2,805).
It is where the Courier-Journal's weekly inspection lists come from.

One row per place and kind of inspection, with only the **latest** result:

| Column                      | Example                                                  |
| --------------------------- | -------------------------------------------------------- |
| NAME                        | A TASTE OF THAI                                          |
| ADDRESS                     | 6549 WEST HWY 22                                         |
| CITY                        | CRESTWOOD (also LAGRANGE / LA GRANGE)                    |
| LAST INSPECTION DATE        | 3/18/2026 (blank for a place not inspected yet)          |
| LAST INSPECTION SCORE/GRADE | 94, sometimes 98/A; hovering lists the form items marked |
| FOLLOW-UP DATE              | 5/26/2026                                                |
| FOLLOW-UP SCORE/GRADE       | 100                                                      |

## How it compares

|                    | Louisville (ArcGIS)     | Bullitt (its sheet) | The portal                          |
| ------------------ | ----------------------- | ------------------- | ----------------------------------- |
| Inspection date    | yes                     | **no**              | **yes**                             |
| History            | back to ~2016           | latest only         | latest only                         |
| Ids                | yes                     | no                  | no (made from name + address)       |
| Coordinates        | most places             | no (geocoded)       | no (to geocode)                     |
| Facility type      | yes                     | no                  | no                                  |
| Violations         | failed inspections only | every marked item   | every marked item                   |
| Inspector comments | yes                     | no                  | no                                  |
| What it lists      | food service            | food service        | food **and** hotels, pools, schools |

Things to know about the portal's rows:

- **A place can have several rows**, one per kind of inspection done there: a school's
  cafeteria and its building (Buckner Elementary: 92 for "Playground area and equipment"
  and 100 for food, same day), a hotel and its pool. Nothing says which row is which.
  `parse.js` therefore treats name + address as one place holding every result; it never
  drops a "duplicate", and the result doesn't depend on the order of the rows.
- **Non-food places are included** (the owner's call, to match the Courier-Journal): a
  hotel's score is about bedding and furniture.
- Bullitt on the portal has the same 250 places as the county's Google Sheet, with dates,
  and is updated sooner. Names and addresses match the sheet's, so the ids
  (`bullitt-<hash>`) come out the same.

## Reading it

The portal is an ASP.NET page, not an API (`pipeline/regions/kyportal/fetch.js`):

1. `GET ...?County=93` redirects to a session URL, `/KYEnvPBL/(S(abc123))/...`. The
   session is in the URL, not in a cookie, so the next request must go to that URL.
2. The table shows 10 rows a page. Posting the page's own form back with the page size
   set to 999, the most it accepts, returns the whole county.

Two requests per county, about 450 KB. Counties with more than 999 rows (Jefferson,
Fayette) would need paging, which isn't built: the reader refuses them instead of looping.
`parse.js` stops the job if the table, its columns or its row count aren't what it
expects, so a redesign of the portal fails loudly instead of loading wrong data.

```
cd pipeline
node regions/kyportal/ingest.js --county=oldham --dry-run                     # download, print
node regions/kyportal/ingest.js --county=oldham --dry-run --save=oldham.html  # keep the page
node regions/kyportal/ingest.js --county=oldham --dry-run --from=oldham.html  # no network
node regions/kyportal/ingest.js --county=oldham                               # the daily load
```

(`npm run portal -w pipeline -- --county=oldham --dry-run` also works; in PowerShell quote
the `'--'`.) Tests: `pipeline/tests/kyportal_parse.test.js` and `kyportal_fetch.test.js`,
against `pipeline/tests/fixtures/kyportal_oldham.html`, eight real rows; storing is
tested in `kyportal_store.test.js` against a database stand-in.

## Storing it

`supabase/migrations/20261119000000_portal_counties.sql`, one set of tables for every
portal county, keyed by `region`:

- `portal_regions`: one row per county, when the portal last answered and what it held
  (a fingerprint of the parsed places, so an unchanged county writes nothing else).
- `portal_establishments`: places, with coordinates. Ids are `<region>-<hash>`.
- `portal_inspections`: every result seen, unique by place, kind and content (kind, date,
  score, items). A place can have two routine results on one day (a school's cafeteria
  and its playground), so the date alone can't be the key. A follow-up's score posted
  later is a new row; `first_seen`/`last_seen` tell which rows are current.

No copy of the page goes in the database (it is 450 KB and changes most days); the
workflow keeps it for 30 days instead.

Geocoding is Bullitt's chain, shared in `pipeline/lib/countyGeocode.js`: hand-placed pins
(`regions/kyportal/overrides/<county>.json`), 911 address points, Census, Nominatim.
Cache keys start with the county (`oldham|...`).

Courtesy: once a day per county is plenty (the Courier-Journal's lists move weekly).

## Terms of use (checked 2026-11-12)

- The portal pages carry only "Copyright © 2026 Custom Data Processing, Inc." No terms
  link, no disclaimer, no robots.txt.
- CDP's company site has [terms](https://www.cdpehs.com/terms-of-use/) that allow
  "personal, non-commercial transitory viewing only" and forbid copying and public display.
  They read as a stock template, don't name the portal, and the portal doesn't link them.
- The scores are the health departments' public records (Kentucky Open Records Act, KRS
  61.870 to 61.884), and facts aren't copyrightable; the Courier-Journal republishes them
  weekly. Using records for "sale, resale, solicitation, rent, or lease" is a commercial
  purpose (KRS 61.870(4)): keep the site free and never sell the data.
- Not legal advice. The owner is asking Oldham County Health Department
  (ochd.admin@ky.gov, 502-222-3516) before Oldham shows on the site.

## If the portal goes away

The portal is a web page someone else runs; it can change, block us, or close. Built for
that:

- **Separate jobs, separate tables.** `portal-ingest.yml` writes only `portal_*`.
  Jefferson (`ingest.yml`, ArcGIS) and Bullitt (`bullitt-ingest.yml`, its sheet) keep
  loading from their own sources whatever happens to the portal. Showing Bullitt from the
  portal later won't retire the sheet import.
- **A broken read writes nothing.** The parser stops on a changed table, columns or row
  count, and a county that shrinks to under half is refused, so the last good load stays
  on the site. The workflow goes red and GitHub emails the owner.
- **The site falls back by itself.** `portal_regions.last_checked_at` is the last time
  the portal answered for a county. Bullitt's results switch to the sheet once that is
  more than 3 days old (`bullitt_results`) and back when the portal answers again; Oldham
  will keep its last load, with an "updated <date>" note.
- **Loading without the portal.** `--from=<file>` loads a page saved earlier (each run
  keeps its page for 30 days as a workflow artifact), with no portal request.
- **Turning it off:** disable `portal-ingest.yml` in GitHub (Actions, the workflow, "...",
  Disable workflow). Nothing else depends on it.

## What's next

1. ~~**Store Oldham**~~: done (tables, daily job, geocoding).
2. **Show Oldham** on the map, drawer, What's New, Table View, saved places and the digest.
3. ~~**Read Bullitt from the portal too**~~: done. `bullitt_results` (migration
   `20261120000000`) serves the portal's dated results while `portal_regions` says the
   portal answered for Bullitt in the last 3 days, and the sheet's otherwise. Places, pins
   and saved places stay on `bullitt_establishments`; ids are the same in both sources.
   When the portal becomes the source, a place's drawer history starts from the portal's
   first load (the sheet's older undated versions aren't merged in).
4. Later: more counties (a line in `counties.js`, an outline, a geocoding run), and
   Jefferson's marked items for inspections that passed, which ArcGIS doesn't publish.
