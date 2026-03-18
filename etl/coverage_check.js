/**
 * coverage_check.js — post-ingest data quality report.
 *
 * Queries Supabase and prints a health summary covering:
 *   - Coordinate coverage (how many map pins exist)
 *   - Type/subtype coverage (how many pass through category filters)
 *   - Inspection recency (stale facilities)
 *   - Unmapped facility type:subtype pairs (unknown in frontend)
 *   - Stub facilities (no name/address)
 *
 * Usage:
 *   node coverage_check.js              # prints report, exits 0
 *   node coverage_check.js --strict     # exits 1 if any threshold breached
 *
 * Add to ingest.yml as the final step to surface data regressions in CI.
 */
import 'dotenv/config';
import { supa } from './lib/db.js';

const STRICT = process.argv.includes('--strict');

// Thresholds for --strict mode
const THRESHOLDS = {
  pctHasCoords:    85,   // % of facilities that should have lon/lat
  pctHasType:      70,   // % of facilities that should have facility_type+subtype
  pctMappable:     65,   // % of facilities that are both geocoded AND typed (appear on map with correct filter)
  maxStaleDays:    90,   // facilities with no inspection in this many days are flagged
  maxStaleCount:   200,  // how many stale facilities are acceptable before flagging
};

// The ft:st pairs your frontend CATEGORY_SPECS covers (excludes the explicit "unknown" bucket)
const KNOWN_PAIRS = new Set([
  '605:11', '605:33', '605:31', '605:32',   // restaurants, schools, daycare, hospitals
  '603:51', '603:53',                         // concessions
  '605:42', '605:43',                         // caterers/commissary
  '610:61', '610:62', '610:63', '610:64', '610:65', '610:73', '610:212',
  '607:54', '607:55', '605:54',               // retail
  '605:36', '604:16', '605:52',               // explicit unknown/other
]);

function pct(n, d) {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function check(label, value, threshold, higherIsBetter = true) {
  const pass = higherIsBetter ? value >= threshold : value <= threshold;
  const icon = pass ? '✓' : '✗';
  return { pass, line: `  ${icon}  ${label}: ${value} (threshold: ${higherIsBetter ? '>=' : '<='} ${threshold})` };
}

const failures = [];

async function section(title, fn) {
  console.log(`\n${'─'.repeat(56)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(56));
  await fn();
}

(async function run() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║           Louisville Food Safe — Coverage Check      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  ${new Date().toISOString()}`);

  // ── 1. Top-line counts ───────────────────────────────────────────────────────
  await section('1. Facility counts', async () => {
    const { count: total } = await supa.from('facilities').select('*', { head: true, count: 'exact' });
    const { count: withCoords } = await supa.from('facilities').select('*', { head: true, count: 'exact' }).not('lon', 'is', null);
    const { count: withType } = await supa.from('facilities').select('*', { head: true, count: 'exact' }).not('facility_type', 'is', null);
    const { count: withBoth } = await supa.from('facilities').select('*', { head: true, count: 'exact' }).not('lon', 'is', null).not('facility_type', 'is', null);
    const { count: nullType } = await supa.from('facilities').select('*', { head: true, count: 'exact' }).is('facility_type', null);
    const { count: nullCoords } = await supa.from('facilities').select('*', { head: true, count: 'exact' }).is('lon', null);
    const { count: nullName } = await supa.from('facilities').select('*', { head: true, count: 'exact' }).is('name', null);

    console.log(`  Total facilities:          ${total}`);
    console.log(`  With coordinates:          ${withCoords}  (${pct(withCoords, total)})`);
    console.log(`  With type+subtype:         ${withType}  (${pct(withType, total)})`);
    console.log(`  Fully mappable (both):     ${withBoth}  (${pct(withBoth, total)})`);
    console.log(`  Missing coordinates:       ${nullCoords}`);
    console.log(`  Missing type/subtype:      ${nullType}`);
    console.log(`  Missing name (stubs):      ${nullName}`);

    const pctCoords   = withCoords  / total * 100;
    const pctTyped    = withType    / total * 100;
    const pctMappable = withBoth    / total * 100;

    const c1 = check(`Coordinate coverage ${pct(withCoords, total)}`, pctCoords,   THRESHOLDS.pctHasCoords);
    const c2 = check(`Type coverage ${pct(withType, total)}`,         pctTyped,    THRESHOLDS.pctHasType);
    const c3 = check(`Mappable coverage ${pct(withBoth, total)}`,     pctMappable, THRESHOLDS.pctMappable);

    console.log('\n  Threshold checks:');
    [c1, c2, c3].forEach(c => { console.log(c.line); if (!c.pass) failures.push(c.line); });
  });

  // ── 2. Inspection recency ────────────────────────────────────────────────────
  await section('2. Inspection recency', async () => {
    const { data: latest } = await supa
      .from('inspections')
      .select('inspection_date')
      .order('inspection_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: oldest } = await supa
      .from('inspections')
      .select('inspection_date')
      .order('inspection_date', { ascending: true })
      .limit(1)
      .maybeSingle();

    const { count: totalInsp } = await supa.from('inspections').select('*', { head: true, count: 'exact' });

    console.log(`  Total inspections:   ${totalInsp}`);
    console.log(`  Latest inspection:   ${latest?.inspection_date ?? 'none'}`);
    console.log(`  Oldest inspection:   ${oldest?.inspection_date ?? 'none'}`);

    if (latest?.inspection_date) {
      const daysSince = Math.floor((Date.now() - new Date(latest.inspection_date)) / 86400000);
      const c = check(`Days since latest inspection: ${daysSince}`, daysSince, 7, false);
      console.log('\n  Threshold checks:');
      console.log(c.line);
      if (!c.pass) failures.push(c.line);
    }

    // Facilities with inspections but none recently
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - THRESHOLDS.maxStaleDays);
    const staleDateStr = staleDate.toISOString().slice(0, 10);

    const { data: staleRows } = await supa
      .from('v_facility_map_feed')
      .select('establishment_id, inspection_date_recent')
      .not('inspection_date_recent', 'is', null)
      .lt('inspection_date_recent', staleDateStr)
      .limit(5);

    if (staleRows?.length) {
      console.log(`\n  Sample facilities with no inspection since ${staleDateStr}:`);
      staleRows.forEach(r => console.log(`    establishment_id=${r.establishment_id}  last=${r.inspection_date_recent}`));
    }
  });

  // ── 3. Category/type coverage breakdown ─────────────────────────────────────
  await section('3. Category coverage (frontend filter impact)', async () => {
    // Paginate — bare .select() without .range() silently caps at 1000 rows.
    const PAGE = 1000;
    let typeCounts = [];
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await supa
        .from('facilities')
        .select('facility_type, subtype')
        .not('lon', 'is', null)
        .range(off, off + PAGE - 1);
      if (error || !data?.length) break;
      typeCounts = typeCounts.concat(data);
      if (data.length < PAGE) break;
    }

    if (!typeCounts.length) { console.log('  Could not fetch (view may differ)'); return; }

    const byPair = new Map();
    let knownCount = 0, unknownCount = 0, nullCount = 0;

    for (const r of typeCounts) {
      if (r.facility_type == null || r.subtype == null) { nullCount++; continue; }
      const key = `${r.facility_type}:${r.subtype}`;
      byPair.set(key, (byPair.get(key) ?? 0) + 1);
      if (KNOWN_PAIRS.has(key)) knownCount++; else unknownCount++;
    }

    const total = typeCounts.length;
    console.log(`  Map-visible facilities:     ${total}`);
    console.log(`  Known category (filterable): ${knownCount}  (${pct(knownCount, total)})`);
    console.log(`  Falls to "unknown" bucket:   ${unknownCount}  (${pct(unknownCount, total)})`);
    console.log(`  No type at all (invisible):  ${nullCount}  (${pct(nullCount, total)})`);

    // List any unmapped pairs — these should be added to CATEGORY_SPECS or are genuinely miscellaneous
    const unmapped = [...byPair.entries()]
      .filter(([k]) => !KNOWN_PAIRS.has(k))
      .sort((a, b) => b[1] - a[1]);

    if (unmapped.length) {
      console.log('\n  Unmapped type:subtype pairs on the map (review for CATEGORY_SPECS):');
      unmapped.forEach(([k, n]) => console.log(`    ${k.padEnd(10)}  ${n} facilities`));
    }
  });

  // ── 4. Geocode source breakdown ──────────────────────────────────────────────
  await section('4. Geocode source breakdown', async () => {
    // Paginate — bare .select() without .range() silently caps at 1000 rows.
    const PAGE = 1000;
    let rows = [];
    for (let off = 0; ; off += PAGE) {
      const { data, error } = await supa
        .from('facilities')
        .select('loc_source')
        .not('lon', 'is', null)
        .range(off, off + PAGE - 1);
      if (error || !data?.length) break;
      rows = rows.concat(data);
      if (data.length < PAGE) break;
    }

    if (!rows.length) return;
    const counts = rows.reduce((m, r) => { m.set(r.loc_source, (m.get(r.loc_source) ?? 0) + 1); return m; }, new Map());
    [...counts.entries()].sort((a,b) => b[1]-a[1]).forEach(([src, n]) => {
      console.log(`  ${(src ?? 'null').padEnd(20)} ${n}`);
    });

    // Geocode cache health — shows how many prior attempts returned null vs a real coordinate.
    const { count: cacheTotal } = await supa.from('geocode_cache').select('*', { head: true, count: 'exact' });
    const { count: cacheMisses } = await supa.from('geocode_cache').select('*', { head: true, count: 'exact' }).is('lon', null);
    if (cacheTotal != null) {
      const cacheHits = cacheTotal - (cacheMisses ?? 0);
      console.log(`\n  geocode_cache: ${cacheTotal} entries  (${cacheHits} hits, ${cacheMisses ?? '?'} misses)`);
      if ((cacheMisses ?? 0) > 0) {
        console.log(`  → Run: node geocode_missing.js --retry-failures  to re-attempt cached misses`);
      }
    }
  });

  // ── 5. Recent import_runs ────────────────────────────────────────────────────
  await section('5. Recent import runs (last 5)', async () => {
    const { data: runs } = await supa
      .from('import_runs')
      .select('run_id, source, started_at, finished_at, rows_read, rows_upserted, notes')
      .order('started_at', { ascending: false })
      .limit(5);

    if (!runs?.length) { console.log('  No runs recorded.'); return; }

    for (const r of runs) {
      const status = !r.finished_at ? '⏳ running' : r.notes?.error ? '✗ failed' : '✓ ok';
      const duration = r.finished_at
        ? `${Math.round((new Date(r.finished_at) - new Date(r.started_at)) / 1000)}s`
        : '—';
      console.log(`  ${status}  ${r.source.padEnd(20)} ${r.started_at?.slice(0,10)}  rows: ${r.rows_upserted ?? '—'}  (${duration})`);
      if (r.notes?.error) console.log(`         error: ${r.notes.error}`);
    }

    // Flag any stuck runs (started but no finished_at in > 1 hour)
    const stuckRuns = (runs || []).filter(r => !r.finished_at && (Date.now() - new Date(r.started_at)) > 3600000);
    if (stuckRuns.length) {
      const line = `  ✗  ${stuckRuns.length} run(s) appear stuck (no finished_at after 1h)`;
      console.log(line);
      failures.push(line);
    }
  });

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(56)}`);
  if (failures.length === 0) {
    console.log('  ✓  All threshold checks passed.');
  } else {
    console.log(`  ✗  ${failures.length} threshold check(s) failed:`);
    failures.forEach(f => console.log(`     ${f.trim()}`));
  }
  console.log('═'.repeat(56));

  if (STRICT && failures.length > 0) {
    process.exit(1);
  }
})().catch(err => {
  console.error('coverage_check failed:', err);
  process.exit(1);
});