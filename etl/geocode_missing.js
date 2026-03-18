/**
 * geocode_missing.js
 *
 * Geocodes facilities that have an address but no geometry.
 * Falls back: Nominatim → US Census Bureau (no API key needed for either).
 *
 * Usage:
 *   node geocode_missing.js                   # skip anything already in geocode_cache
 *   node geocode_missing.js --retry-failures  # also retry cached null-result entries
 *   node geocode_missing.js --dry-run         # print what would be attempted, no writes
 *
 * The cache stores both hits AND misses. Without --retry-failures, misses are
 * permanently skipped. Use --retry-failures after improving address data or
 * after overlay_geometry fills in missing city/state.
 */
import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOMINATIM  = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'LouisvilleFoodSafe/1.0 (louisvillefoodsafe.netlify.app)';
const DELAY_MS   = 1100;  // Nominatim ToS: max 1 req/sec
const PAGE_SIZE  = 1000;

// Default city/state for Louisville Metro facilities when the DB row is missing them.
// All facilities in this dataset are Jefferson County, KY.
const DEFAULT_CITY  = 'Louisville';
const DEFAULT_STATE = 'KY';

const RETRY_FAILURES = process.argv.includes('--retry-failures');
const DRY_RUN        = process.argv.includes('--dry-run');

if (RETRY_FAILURES) console.log('Mode: --retry-failures  (will retry cached null-result entries)');
if (DRY_RUN)        console.log('Mode: --dry-run  (no writes)');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Strip suite/unit qualifiers that confuse geocoders
// "123 MAIN ST STE 104" → "123 MAIN ST"
function stripSuite(addr) {
  return addr
    .replace(/\s+(STE|SUITE|APT|UNIT|#|BLDG|FL|FLOOR|RM|ROOM|BOX|PMB|NUM|NO\.?)[\s#\w&-]*/gi, '')
    .trim();
}

// Build the normalised cache key and Nominatim query string.
// Falls back to Louisville, KY when city/state are absent.
function buildQuery(row) {
  const street = stripSuite(row.address || '');
  const city   = row.city  || DEFAULT_CITY;
  const state  = row.state || DEFAULT_STATE;
  const zip    = row.zip   || '';
  return [street, city, state, zip].filter(Boolean).join(', ');
}

function cacheKey(query) {
  return query.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Nominatim geocode
async function geocodeNominatim(query) {
  const url = `${NOMINATIM}?` + new URLSearchParams({
    q:              query,
    format:         'json',
    limit:          '1',
    countrycodes:   'us',
    addressdetails: '0',
  });

  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' }
  });
  if (!res.ok) { console.error(`Nominatim HTTP ${res.status}`); return null; }

  const json = await res.json();
  if (!Array.isArray(json) || !json.length) return null;

  const hit = json[0];
  return {
    lon:        parseFloat(hit.lon),
    lat:        parseFloat(hit.lat),
    confidence: parseFloat(hit.importance ?? 0),
    provider:   'nominatim',
    raw:        hit,
  };
}

// US Census Bureau geocoder — structured address, no API key, excellent for US streets
async function geocodeCensus(row) {
  const url = 'https://geocoding.geo.census.gov/geocoder/locations/address?' + new URLSearchParams({
    street:    stripSuite(row.address || ''),
    city:      row.city  || DEFAULT_CITY,
    state:     row.state || DEFAULT_STATE,
    zip:       row.zip   || '',
    benchmark: 'Public_AR_Current',
    format:    'json',
  });

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) { console.error(`Census HTTP ${res.status} for "${row.address}"`); return null; }

  const json  = await res.json();
  const match = json?.result?.addressMatches?.[0];
  if (!match) return null;

  return {
    lon:        match.coordinates.x,
    lat:        match.coordinates.y,
    confidence: 1.0,
    provider:   'census',
    raw:        match,
  };
}

(async function run() {
  // ── 1. Facilities needing a geocode ─────────────────────────────────────────
  let allRows = [];
  let offset  = 0;
  for (;;) {
    const { data, error } = await supa
      .from('facilities')
      .select('establishment_id, name, address, city, state, zip')
      .is('geom', null)
      .not('address', 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    allRows = allRows.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`Facilities with address but no geometry: ${allRows.length}`);
  if (!allRows.length) { console.log('Nothing to do.'); return; }

  // ── 2. Load cache — distinguish hits from misses ─────────────────────────────
  // We load key + lon + lat so we can replay DB writes for cache hits that never landed.
  const { data: cacheRows, error: cErr } = await supa
    .from('geocode_cache')
    .select('key, lon, lat, provider, confidence, meta');
  if (cErr) throw cErr;

  const cachedHits   = new Map();  // key → { lon, lat, provider, confidence, meta }
  const cachedMisses = new Set();  // key that previously returned null

  for (const r of (cacheRows || [])) {
    if (r.lon != null) cachedHits.set(r.key, r);
    else               cachedMisses.add(r.key);
  }

  console.log(`Cache: ${cachedHits.size} hits, ${cachedMisses.size} misses`);
  if (RETRY_FAILURES) {
    console.log(`--retry-failures: will re-attempt all ${cachedMisses.size} cached misses`);
  }

  // ── 3. Geocode loop ──────────────────────────────────────────────────────────
  let geocoded = 0, skipped = 0, retried = 0, failed = 0;

  for (const row of allRows) {
    const query = buildQuery(row);
    if (!query.trim()) { skipped++; continue; }

    const key = cacheKey(query);

    if (cachedHits.has(key)) {
      // Cache has coordinates but DB still has no geom — replay the write.
      const cached = cachedHits.get(key);
      const { error: replayErr } = await supa
        .from('facilities')
        .update({
          geom:               `SRID=4326;POINT(${cached.lon} ${cached.lat})`,
          loc_source:         cached.provider ?? 'nominatim',
          geocode_provider:   cached.provider,
          geocode_confidence: cached.confidence,
          geocode_meta:       cached.meta,
          is_approximate:     true,
        })
        .eq('establishment_id', row.establishment_id);
      if (replayErr) {
        console.error(`  Cache-replay DB error [${row.establishment_id}]:`, replayErr.message);
        failed++;
      } else {
        console.log(`  ↺  [${row.establishment_id}] "${row.name || '?'}"  (cache replay) → ${cached.lat.toFixed(5)}, ${cached.lon.toFixed(5)}`);
        geocoded++;
      }
      continue;
    }

    if (cachedMisses.has(key) && !RETRY_FAILURES) {
      // Previously failed and we're not retrying.
      skipped++;
      continue;
    }

    if (cachedMisses.has(key)) retried++;

    if (DRY_RUN) {
      console.log(`  [dry-run] would attempt: "${query}"`);
      continue;
    }

    await sleep(DELAY_MS);

    let result = null;
    try {
      result = await geocodeNominatim(query);
      if (!result) {
        result = await geocodeCensus(row);
        if (result) console.log(`  → Census hit for "${query}"`);
      }
    } catch (e) {
      console.error(`Geocode error for "${query}":`, e.message);
    }

    // Write cache entry regardless of success/failure.
    await supa.from('geocode_cache').upsert({
      key,
      lon:        result?.lon  ?? null,
      lat:        result?.lat  ?? null,
      provider:   result?.provider ?? null,
      confidence: result?.confidence ?? null,
      meta:       result?.raw ?? null,
    }, { onConflict: 'key' });

    if (result) cachedHits.set(key, { lon: result.lon, lat: result.lat, provider: result.provider, confidence: result.confidence, meta: result.raw });
    else        cachedMisses.add(key);

    if (!result) {
      console.warn(`  ✗ no result  [${row.establishment_id}] "${row.name || '(no name)'}"  query: "${query}"`);
      failed++;
      continue;
    }

    // lat/lon are generated columns — write only geom
    const { error: updErr } = await supa
      .from('facilities')
      .update({
        geom:               `SRID=4326;POINT(${result.lon} ${result.lat})`,
        loc_source:         result.provider,
        geocode_provider:   result.provider,
        geocode_confidence: result.confidence,
        geocode_meta:       result.raw,
        is_approximate:     true,
      })
      .eq('establishment_id', row.establishment_id);

    if (updErr) {
      console.error(`  DB error [${row.establishment_id}]:`, updErr.message);
      failed++;
    } else {
      console.log(`  ✓  [${row.establishment_id}] "${row.name || '?'}"  (${result.provider}) → ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}`);
      geocoded++;
    }
  }

  console.log(`\nDone.`);
  console.log(`  Geocoded:      ${geocoded}`);
  console.log(`  Retried misses: ${retried}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Failed:         ${failed}`);
  if (failed > 0) {
    console.log(`\n  Tip: ${failed} addresses returned no result from either Nominatim or Census.`);
    console.log(`  These are likely: closed/demolished locations, incomplete addresses,`);
    console.log(`  or rural routes. They won't appear on the map.`);
  }
})().catch(err => {
  console.error('geocode_missing failed:', err);
  process.exit(1);
});