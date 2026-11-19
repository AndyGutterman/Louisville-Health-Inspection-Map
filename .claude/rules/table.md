---
paths:
  - "apps/web/src/features/table/**"
  - "apps/web/src/lib/{tableQuery,tablePaging}.js"
  - "apps/web/src/api/table.js"
---

# Table View

- Reads `v_table_latest` / `v_table_inspections` (Jefferson and Bullitt), limited to the counties switched on. It loads nothing until first opened and asks for a row count only when filters change (`lib/tableQuery.js`). Table View pages are the second-biggest egress cost after a fresh map load: keep pages small.
- On phones, filters fold behind a button and rows are cards.
- Facility chips only filter Jefferson (Bullitt has no types): picking one switches County to Jefferson; picking Bullitt shows a note instead of chips.
- **Search:** `searchFilters` in `lib/tableQuery.js`, a PostgREST `imatch` regex per word, built from `lib/searchText.js` (the same normalising as the map).
- `useLatest` keeps a parent's callback out of an effect's dependencies (`onResize` in `features/table/useTableResize.js`). Paging maths is in `lib/tablePaging.js`.
