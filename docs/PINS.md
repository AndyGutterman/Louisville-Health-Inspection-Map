# The pin control center

`/?page=pins` (or **Pin control center** in the Saved panel, for admins) is where an admin works through the places the geocoders couldn't pin, county by county, and fixes them by hand. It is built to take every Kentucky county the site adds: nothing in it names a county.

## What you can do with a place

| Fix               | When                                                                             | What happens                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Save address**  | The source has a typo the geocoder trips on (`PEEWEE VALLEY` for `PEWEE VALLEY`) | The corrected address waits for **Geocode now** (or the county's next daily run). The site keeps showing the source's address. |
| **Use this pin**  | The address is right but no geocoder finds it                                    | On the map at once (the next map load; visitors' cached pins refresh daily).                                                   |
| **Leave off map** | A mobile vendor's out-of-state base, a mailing address                           | Off the map at once, and never looked up again.                                                                                |
| **Skip**          | Nothing to do for now                                                            | Out of the queue (into Skipped) until undone. The daily geocoding still tries it.                                              |
| **Undo fix**      | Any fix                                                                          | The place goes back exactly as it was before its first fix, pin and all.                                                       |

"Apply my fix to the N other places at this address" covers a strip mall's shops in one go (each still gets its own fix).

## The queues

Each place is in at most one, decided in the database (`v_admin_pin_rows.bucket`):

- **No pin**: active, no pin, no fix.
- **Still not found**: an address fix the geocoders still couldn't find, or found outside the county. Place the pin by hand.
- **Outside county**: a geocoder's pin outside the county outline (flagged, still on the map).
- **Approximate**: a 911 point between neighbouring house numbers (`ky911-approx`).
- **Waiting**: address fixes waiting for Geocode now. **Fixed**, **Skipped**, **Left off map**: done.

A queue lists the most recently inspected places first, 25 a page: the ones people look up. Jefferson has about 1,200 places without a pin, most of them not inspected in years.

## Geocode now

The button starts the **Pin fixes** workflow (`.github/workflows/pin-fixes.yml`, `pipeline/pins/run.js`) through the `pins-dispatch` edge function, and the page shows each waiting fix as it comes back (a small read every 10 s, for at most 5 minutes). The job runs each county's full chain (`pipeline/lib/countyGeocode.js`: 911 address points, Census, Nominatim) on the corrected address, at most 50 fixes a run:

- **found** inside the county: the pin goes on the map in the same transaction (`place_fix_record_result`);
- **outside** the county: kept on the fix for you to judge, not put on the map;
- **not found**: place it by hand.

A fix you save again while the job is looking it up is left as you saved it.

## Where things live

- **Database:** `place_fixes` (one row per place id, every county) and the `admin_*` functions, in migrations `20261130000000_place_fixes.sql` and `20261130010000_place_fix_results.sql`. Each fix keeps the place as it was before its first fix (`source_*`), for Undo and the record. Admins only: every function checks `admin_users`.
- **Pipeline:** `lib/placeFixes.js` (how geocoding uses fixes), `lib/geocodeRegions.js` (every county's geocoding settings), `pins/fixJob.js` (Geocode now). Every daily job reads the county's fixes: a corrected address is what gets looked up, a hand pin beats every geocoder, a hidden place is never looked up, and `--redo-geocoding` spares both. Jefferson's `overlay_geometry.js` never touches a hand-placed pin (`lib/facilityRows.js`).
- **Website:** `features/pins/` (`PinsPage`, `PinQueue`, `PlaceEditor`, `PinMap`, `usePinJob`), `api/pins.js`, `lib/pinQueue.js`. English only, like the email admin page.

## A new county

Nothing to do here. A portal county added in `pipeline/regions/kyportal/counties.js` (with its outline) is in `lib/geocodeRegions.js` and `v_admin_places` by itself, and shows in the county list once it has places. A county from a source of its own (not the portal) needs a branch in `v_admin_places` and an entry in `GEOCODE_REGIONS`.

## The old overrides.json files

Hand pins used to be JSON files per county (`pipeline/regions/bullitt/overrides.json`, `pipeline/regions/kyportal/overrides/*.json`). They still work, and a fix in the table wins over them. To move them into the table, once, after the migration (from `pipeline/`):

```
node pins/import_json.js --dry-run    # lists each county's pins and hides; writes nothing
node pins/import_json.js
```

Then the files and `lib/overrides.js` can be removed.

## Setting it up (once)

1. Run the two migrations in the Supabase SQL editor, in order.
2. Deploy the function: `npx supabase functions deploy pins-dispatch --project-ref iyahhhgqmhbadgczbfwy`. It uses the `GITHUB_DISPATCH_TOKEN` secret the email admin page already has.
3. Optionally, import the JSON pins (above).
