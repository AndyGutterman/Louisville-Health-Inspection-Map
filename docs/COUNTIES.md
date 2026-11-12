# More counties, from Kentucky's inspection portal

Status (2026-11-12): the pipeline can **read** a county from the portal and print it
(`pipeline/regions/kyportal/`). Nothing is stored or shown on the site yet. Oldham County
is first; Bullitt moves onto the portal after it. The steps are at the end.

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
```

(`npm run portal -w pipeline -- --county=oldham --dry-run` also works; in PowerShell quote
the `'--'`.) Tests: `pipeline/tests/kyportal_parse.test.js` and `kyportal_fetch.test.js`,
against `pipeline/tests/fixtures/kyportal_oldham.html`, eight real rows.

Courtesy: once a day per county is plenty (the Courier-Journal's lists move weekly). The
portal's terms of use have not been read yet; do that, and tell the health department,
before this runs on a schedule.

## What's next

1. **Store Oldham**: `portal_establishments` / `portal_inspections` tables keyed by
   region, an inspection being unique by place, kind, date and content; the daily job;
   geocoding with the chain Bullitt uses (`docs/BULLITT.md`).
2. **Show Oldham** on the map, drawer, What's New, Table View, saved places and the digest.
3. **Move Bullitt** onto the portal: real dates instead of "Date not published" and
   "posted <date>", and the sheet import retires.
4. Later: more counties (a line in `counties.js`, an outline, a geocoding run), and
   Jefferson's marked items for inspections that passed, which ArcGIS doesn't publish.
