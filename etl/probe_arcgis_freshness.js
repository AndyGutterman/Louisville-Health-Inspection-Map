/**
 * probe_arcgis_freshness.js
 *
 * Investigates how fresh the Louisville ArcGIS food inspection data is.
 * Checks:
 *   1. Service-level metadata (lastEditDate, capabilities)
 *   2. Available timestamp fields in the data
 *   3. The 10 most-recently-modified records and their created/edit timestamps
 *   4. Distribution of inspection_date vs any edit timestamp to estimate the lag
 *
 * Run: node probe_arcgis_freshness.js
 */

import 'dotenv/config';

const BASE = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodServiceData/FeatureServer';

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function main() {
  console.log('═══ ArcGIS Data Freshness Probe ═══\n');

  // ── 1. Service-level info ─────────────────────────────────────────────────
  console.log('1. Fetching service metadata…');
  const svcInfo = await fetchJSON(`${BASE}/0?f=json`);
  const editInfo = svcInfo.editingInfo || {};
  const lastEdit = editInfo.lastEditDate
    ? new Date(editInfo.lastEditDate).toISOString()
    : 'not available';
  console.log(`   Service name : ${svcInfo.name || svcInfo.displayField || '(unnamed)'}`);
  console.log(`   Last edit    : ${lastEdit}`);
  console.log(`   Capabilities : ${svcInfo.capabilities || 'unknown'}`);
  console.log(`   Sync enabled : ${svcInfo.syncEnabled ?? 'unknown'}`);
  console.log(`   Max record count: ${svcInfo.maxRecordCount}`);

  // ── 2. Available fields with timestamps ───────────────────────────────────
  const fields = svcInfo.fields || [];
  const tsFields = fields.filter(f =>
    f.type === 'esriFieldTypeDate' ||
    /date|edit|creat|modif|updat/i.test(f.name)
  );
  console.log('\n2. Timestamp-like fields in the service:');
  if (tsFields.length === 0) {
    console.log('   (none found — only inspection_date may be available)');
  } else {
    for (const f of tsFields) {
      console.log(`   ${f.name} (${f.type}) — alias: ${f.alias}`);
    }
  }

  // ── 3. Most recent records by inspection_date ─────────────────────────────
  console.log('\n3. 10 most recent inspection records (all timestamp fields):');
  const tsFieldNames = tsFields.map(f => f.name);
  const outFields = ['ESTABLISHMENT_ID', 'INSPECTION_DATE', ...tsFieldNames].join(',');
  const recentUrl = `${BASE}/0/query?` +
    `where=INSPECTION_DATE+IS+NOT+NULL` +
    `&outFields=${encodeURIComponent(outFields)}` +
    `&orderByFields=INSPECTION_DATE+DESC` +
    `&resultRecordCount=10` +
    `&f=json`;

  const recent = await fetchJSON(recentUrl);
  const features = recent.features || [];
  if (features.length === 0) {
    console.log('   No records returned.');
  } else {
    for (const feat of features) {
      const a = feat.attributes;
      const inspDate = a.INSPECTION_DATE
        ? new Date(a.INSPECTION_DATE).toISOString().slice(0, 10)
        : 'null';
      const tsVals = tsFieldNames
        .map(n => `${n}=${a[n] ? new Date(a[n]).toISOString() : 'null'}`)
        .join('  ');
      console.log(`   EID=${a.ESTABLISHMENT_ID}  inspection_date=${inspDate}  ${tsVals}`);
    }
  }

  // ── 4. Lag distribution: last 30 days ─────────────────────────────────────
  if (tsFieldNames.length > 0) {
    console.log('\n4. Lag distribution (inspection_date vs earliest edit timestamp, last 30 days):');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutMs = cutoff.getTime();

    const lagUrl = `${BASE}/0/query?` +
      `where=INSPECTION_DATE+>${cutMs}` +
      `&outFields=${encodeURIComponent(outFields)}` +
      `&orderByFields=INSPECTION_DATE+DESC` +
      `&resultRecordCount=1000` +
      `&f=json`;
    const lagData = await fetchJSON(lagUrl);
    const lags = [];
    for (const feat of lagData.features || []) {
      const a = feat.attributes;
      const insp = a.INSPECTION_DATE;
      if (!insp) continue;
      for (const n of tsFieldNames) {
        const ts = a[n];
        if (!ts) continue;
        const lagHours = (ts - insp) / 3_600_000;
        if (lagHours >= 0 && lagHours < 720) lags.push(lagHours);
      }
    }
    if (lags.length === 0) {
      console.log('   Could not compute lags (no timestamp fields with data).');
    } else {
      lags.sort((a, b) => a - b);
      const median = lags[Math.floor(lags.length / 2)];
      const p25 = lags[Math.floor(lags.length * 0.25)];
      const p75 = lags[Math.floor(lags.length * 0.75)];
      console.log(`   Samples : ${lags.length}`);
      console.log(`   Min lag : ${lags[0].toFixed(1)}h`);
      console.log(`   P25     : ${p25.toFixed(1)}h`);
      console.log(`   Median  : ${median.toFixed(1)}h`);
      console.log(`   P75     : ${p75.toFixed(1)}h`);
      console.log(`   Max lag : ${lags[lags.length - 1].toFixed(1)}h`);
      console.log(`\n   Interpretation: median lag of ${median.toFixed(0)}h means`);
      console.log(`   inspections typically appear in ArcGIS ~${Math.round(median)}h after the inspection date.`);
    }
  } else {
    console.log('\n4. Skipped — no timestamp fields found to compute lag.');
    console.log('   The service may only expose inspection_date, not an edit/upload timestamp.');
    console.log('   In that case, freshness can only be estimated by running the ETL and');
    console.log('   observing how many new records appear each run over several days.');
  }

  // ── 5. Count records added today vs yesterday ──────────────────────────────
  console.log('\n5. Records with inspection_date = today vs yesterday:');
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const [label, date] of [['Today', today], ['Yesterday', yesterday]]) {
    const t0 = new Date(date).getTime();
    const t1 = t0 + 86400000;
    const url = `${BASE}/0/query?where=INSPECTION_DATE+>%3D${t0}+AND+INSPECTION_DATE+<${t1}&returnCountOnly=true&f=json`;
    const r = await fetchJSON(url);
    console.log(`   ${label} (${date}): ${r.count ?? 'unknown'} records`);
  }

  console.log('\n═══ Probe complete ═══');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
