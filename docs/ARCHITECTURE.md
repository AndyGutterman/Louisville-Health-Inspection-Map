# Architecture

Louisville Food Safe is a map of Louisville Metro food-establishment inspections. A set of scripts pulls the city's data into a Supabase database, and a React site reads it.

## System overview

```mermaid
flowchart LR
  src["Louisville Metro<br/>inspection data (ArcGIS REST)"]

  subgraph actions["GitHub Actions"]
    ingest["ingest.yml<br/>runs the etl/ scripts"]
    backup["db-backup.yml"]
    archive["archive.yml<br/>archives old inspections"]
  end

  db[("Supabase<br/>Postgres, Auth, Edge Function")]
  site["Netlify<br/>React + Vite site"]
  geo["Geoapify<br/>address search"]

  src --> ingest --> db
  db --> backup
  db --> archive
  db <-->|supabase-js| site
  site --> geo
```

- **Data in:** the scripts in `etl/` fetch the city's data and write it to Supabase. `etl/tests/` covers the helpers.
- **Data out:** the site reads pins, inspections and violations through `supabase-js`. Accounts use email one-time codes, and watchlists and watch areas are stored per user.
- **Feedback:** the feedback form posts to the `submit-feedback` edge function (`supabase/functions/`), which rate-limits by IP.
- **Address search** for watch areas calls Geoapify directly from the browser.

## Frontend modules

```mermaid
flowchart TD
  main["main.jsx"] --> auth["AuthProvider"]
  main --> splash["withSplashScreen"]
  splash --> map["Map.jsx<br/>app shell and map"]

  map --> filters["FilterSearch<br/>ScoreThreshold"]
  map --> drawer["InfoDrawer"]
  map --> table["TableView"]
  map --> whatsnew["WhatsNew"]
  map --> acct["AccountPage"] --> wl["WatchlistTab"] --> addr["AddressPicker"]
  map --> learn["LearnPage"]
  map --> feedback["FeedbackModal"]
  map --> wal["watchAreaLayer.js"]
  map --> lib["lib/<br/>scoring, categories, dedupe, dates,<br/>samePlaceDetection, geocode, constants"]
  map --> hooks["hooks/useMediaQuery"]
  filters --> hooks
  drawer --> hooks
  addr --> lib

  drawer --> sb["lib/supabase.js"]
  whatsnew --> sb
  table --> sb
  wl --> sb
  learn --> sb
```

`src/lib/` is pure logic and is fully unit tested. Everything above it is UI.

## Example: clicking a row in What's New

```mermaid
sequenceDiagram
  actor User
  participant WN as WhatsNew
  participant Map as Map.jsx
  participant DB as Supabase
  participant Drawer as InfoDrawer

  User->>WN: click a row
  WN->>Map: onOpenEstablishment(eid, row)
  alt the place has a map pin
    Map->>Map: show its popup and use the pin's data
  else no usable coordinates
    Map->>Map: use the row's own data, leave the map alone
  end
  Map->>DB: inspections, violations, facility details
  DB-->>Map: rows
  Map->>Drawer: selected place, history and details
```

## Where do I change...?

| I want to change | Look in |
|---|---|
| Score colours, presets, red/yellow/green bands | `src/lib/scoring.js` |
| Which facility types belong to a category | `src/lib/categories.js` |
| How "may also be listed as" duplicates are detected | `src/lib/samePlaceDetection.js` |
| How pins sharing one location are collapsed | `src/lib/dedupe.js` |
| Date formats | `src/lib/dates.js` |
| Address search for watch areas | `src/lib/geocode.js`, `src/AddressPicker.jsx` |
| Phone / desktop breakpoints in components | `src/hooks/useMediaQuery.js` |
| The info drawer and its history | `src/InfoDrawer.jsx`, `src/styles/RestaurantInfo.css`, `History.css`, `Violations.css` |
| Filters and score sliders | `src/FilterSearch.jsx`, `src/ScoreThreshold.jsx`, `src/styles/AdjustFilter.css` |
| Watch areas on the map | `src/watchAreaLayer.js` |
| Watchlist and account panel | `src/AccountPage.jsx`, `src/WatchlistTab.jsx` |
| Nightly data load | `etl/`, `.github/workflows/ingest.yml` |
| Database views and functions | `supabase/migrations/` |
