import 'dotenv/config';
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

const supa = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'LouisvilleFoodSafe/1.0 (louisvillefoodsafe.netlify.app)';
const DELAY_MS   = 1100;  // Nominatim ToS: max 1 req/sec
const PAGE_SIZE  = 1000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Strip suite/unit qualifiers that confuse Nominatim
// e.g. "123 MAIN ST STE 104" → "123 MAIN ST"
function stripSuite(addr) {
  return addr
    .replace(/\s+(STE|SUITE|APT|UNIT|#|BLDG|FL|FLOOR|RM|ROOM|BOX|PMB|NUM|NO\.?)[\s#\w&-]*/gi, '')
    .trim();
}

// Build the query string we'll send to Nominatim
function buildQuery(row) {
  const street = stripSuite(row.address || '');
  const parts = [street];
  if (row.city)  parts.push(row.city);
  if (row.state) parts.push(row.state);
  if (row.zip)   parts.push(row.zip);
  return parts.filter(Boolean).join(', ');
}

// Nominatim geocode — returns { lon, lat, confidence, raw } or null
async function geocode(query) {
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

  if (!res.ok) {
    console.error(`Nominatim HTTP ${res.status} for "${query}"`);
    return null;
  }

  const json = await res.json();
  if (!Array.isArray(json) || !json.length) return null;

  const hit = json[0];
  return {
    lon:        parseFloat(hit.lon),
    lat:        parseFloat(hit.lat),
    confidence: parseFloat(hit.importance ?? 0),
    raw:        hit,
  };
}

(async function run() {
  // 1. Find all facilities with address but no geometry
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

  console.log(`Found ${allRows.length} facilities with address but no geometry.`);
  if (!allRows.length) { console.log('Nothing to do.'); return; }

  // 2. Load cache keys so we skip already-attempted queries
  const { data: cacheRows, error: cErr } = await supa
    .from('geocode_cache')
    .select('key');
  if (cErr) throw cErr;
  const cachedKeys = new Set((cacheRows || []).map(r => r.key));

  let geocoded = 0, skipped = 0, failed = 0;

  for (const row of allRows) {
    const query = buildQuery(row);
    if (!query.trim()) { skipped++; continue; }

    const cacheKey = query.toLowerCase().replace(/\s+/g, ' ').trim();

    // Check cache first (hit means we already tried and failed — skip again)
    if (cachedKeys.has(cacheKey)) {
      skipped++;
      continue;
    }

    await sleep(DELAY_MS);

    let result = null;
    try {
      result = await geocode(query);
    } catch (e) {
      console.error(`Geocode error for "${query}":`, e.message);
    }

    // Write to geocode_cache regardless (cache misses too, so we don't retry forever)
    await supa.from('geocode_cache').upsert({
      key:        cacheKey,
      lon:        result?.lon  ?? null,
      lat:        result?.lat  ?? null,
      provider:   'nominatim',
      confidence: result?.confidence ?? null,
      meta:       result?.raw ? result.raw : null,
    }, { onConflict: 'key' });
    cachedKeys.add(cacheKey);

    if (!result) {
      console.warn(`  ✗ no result  [${row.establishment_id}] "${query}"`);
      failed++;
      continue;
    }

    // Write geometry back to facilities
    // lat/lon are generated columns — only write geom, Postgres computes the rest
    const { error: updErr } = await supa
      .from('facilities')
      .update({
        geom:                `SRID=4326;POINT(${result.lon} ${result.lat})`,
        loc_source:          'nominatim',
        geocode_provider:    'nominatim',
        geocode_confidence:  result.confidence,
        geocode_meta:        result.raw,
        is_approximate:      true,
      })
      .eq('establishment_id', row.establishment_id);

    if (updErr) {
      console.error(`  DB update error for ${row.establishment_id}:`, updErr.message);
      failed++;
    } else {
      console.log(`  ✓  [${row.establishment_id}] "${row.name}" → ${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}`);
      geocoded++;
    }
  }

  console.log(`\nDone. Geocoded: ${geocoded}  Already cached/skipped: ${skipped}  Failed: ${failed}`);
})().catch(err => {
  console.error('geocode_missing failed:', err);
  process.exit(1);
});