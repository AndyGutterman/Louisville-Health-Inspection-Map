# Louisville Food Safe

A web app for browsing health inspection scores of restaurants and food service establishments across Louisville, KY.

Pulls inspection data from Louisville Metro's ArcGIS open data portal and presents it in a clean, interactive interface.


https://louisvillefoodsafe.netlify.app

---
Features 

- Interactive map powered by **MapLibre GL** with location-based browsing
- Filterable table view with adjustable score thresholds
- Detailed inspection drawer showing current and past inspection records

---

## Architecture

```
ArcGIS Open Data (Louisville Metro)
ETL Pipeline (Node.js)
Supabase (PostgreSQL)
React frontend
Map view (MapLibre GL)
TableView
```

---

## ETL Pipeline

The pipeline fetches inspection records from Louisville Metro's ArcGIS REST API on a scheduled basis via GitHub Actions.

- Import runs are tracked to support recovery from failed/partial syncs

---

## Data Source

Inspection data is sourced from [Louisville Metro Open Data](https://data.louisvilleky.gov/) via the ArcGIS REST API. Data is refreshed periodically and may not reflect the absolute latest inspections.

---

## License 

MIT