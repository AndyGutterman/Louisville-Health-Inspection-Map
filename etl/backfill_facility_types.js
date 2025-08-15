import 'dotenv/config'
import fetch from 'node-fetch'
import { createClient } from '@supabase/supabase-js'

const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const FM = 'https://services1.arcgis.com/79kfd2K6fskCAkyg/ArcGIS/rest/services/FoodMapping/FeatureServer/0/query'
const PAGE = 999
const BATCH = 500

const num = (v) => (Number.isFinite(+v) ? +v : null)
const normId = (v) => {
  if (v == null) return null
  const s = String(v).replace(/,/g, '').trim()
  const n = parseInt(s, 10)
  return Number.isFinite(n) ? String(n) : null
}

async function fetchPage(offset) {
  const body = new URLSearchParams({
    f: 'json',
    where: 'permit_number IS NOT NULL',
    outFields: 'permit_number,facility_type,facility_type_description,subtype,subtype_description',
    returnGeometry: 'false',
    resultRecordCount: String(PAGE),
    resultOffset: String(offset)
  })
  const res = await fetch(FM, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  const txt = await res.text()
  try {
    const js = JSON.parse(txt)
    if (js.error) throw new Error(JSON.stringify(js.error))
    return js.features || []
  } catch (e) {
    throw new Error(`ArcGIS non-JSON: ${txt.slice(0, 200)}`)
  }
}

function mapRows(feats) {
  return feats
    .map(f => {
      const a = f.attributes || {}
      return {
        permit_number: normId(a.permit_number),
        facility_type: num(a.facility_type),
        subtype: num(a.subtype),
        facility_type_description: (a.facility_type_description || '').trim() || null,
        subtype_description: (a.subtype_description || '').trim() || null
      }
    })
    .filter(r => r.permit_number)
}

async function upsertCategories(rows) {
  const m = new Map()
  for (const r of rows) {
    if (r.facility_type == null || r.subtype == null) continue
    const k = `${r.facility_type}|${r.subtype}`
    if (!m.has(k)) m.set(k, {
      facility_type: r.facility_type,
      subtype: r.subtype,
      facility_type_description: r.facility_type_description,
      subtype_description: r.subtype_description
    })
  }
  const arr = [...m.values()]
  for (let i = 0; i < arr.length; i += BATCH) {
    const { error } = await supa
      .from('facility_categories')
      .upsert(arr.slice(i, i + BATCH), { onConflict: 'facility_type,subtype' })
    if (error) throw error
  }
}

async function upsertFacilities(rows) {
  const updates = rows
    .filter(r => r.facility_type != null || r.subtype != null)
    .map(r => ({
      establishment_id: r.permit_number,
      facility_type: r.facility_type,
      subtype: r.subtype
    }))
  for (let i = 0; i < updates.length; i += BATCH) {
    const { error } = await supa
      .from('facilities')
      .upsert(updates.slice(i, i + BATCH), { onConflict: 'establishment_id' })
    if (error) throw error
  }
}

;(async function run() {
  try {
    let offset = 0
    let pages = 0
    let totalRows = 0

    while (true) {
      const feats = await fetchPage(offset)
      if (!feats.length) break
      const rows = mapRows(feats)

      await upsertCategories(rows)   // FK first
      await upsertFacilities(rows)

      pages++
      totalRows += rows.length
      console.log(`page ${pages}: fetched ${rows.length} rows`)
      offset += feats.length
    }

    console.log(`done. processed ~${totalRows} FoodMapping rows`)
  } catch (err) {
    console.error('backfill_facility_types_full failed:', err?.message || err)
    process.exit(1)
  }
})()
