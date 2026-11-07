// A small, made-up Louisville dataset served in place of Supabase (see mockSupabase.js).
// Dates are relative to today so the map's "1 year" filter and What's New's
// "last 30 days" window always include them.

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

// One row per establishment. `lon`/`lat` null means the place has no map pin.
const PLACES = [
  {
    eid: "100001",
    name: "Bluegrass Diner",
    address: "100 W MAIN ST",
    lon: -85.76,
    lat: 38.256,
    ft: 605,
    st: 11,
    score: 98,
    grade: "A",
    days: 12,
  },
  {
    eid: "100002",
    name: "River City Tacos",
    address: "200 E MARKET ST",
    lon: -85.748,
    lat: 38.254,
    ft: 605,
    st: 11,
    score: 82,
    grade: "C",
    days: 5,
    critical: true,
  },
  {
    eid: "100003",
    name: "Highlands Bakery",
    address: "1300 BARDSTOWN RD",
    lon: -85.72,
    lat: 38.23,
    ft: 610,
    st: 61,
    score: 91,
    grade: "A",
    days: 40,
  },
  {
    eid: "100004",
    name: "Okolona Elementary Cafeteria",
    address: "7606 PRESTON HWY",
    lon: -85.688,
    lat: 38.141,
    ft: 605,
    st: 33,
    score: 100,
    grade: "A",
    days: 20,
  },
  {
    eid: "100005",
    name: "Waterfront Concessions",
    address: "129 RIVER RD",
    lon: -85.74,
    lat: 38.261,
    ft: 603,
    st: 51,
    score: 88,
    grade: "A",
    days: 8,
  },
  // A mobile vendor: no address and no coordinates, so What's New shows
  // "Location unavailable" and the drawer shows "No map location on file".
  {
    eid: "100099",
    name: "Mobile Food Truck",
    address: null,
    lon: null,
    lat: null,
    ft: 605,
    st: 11,
    score: 79,
    grade: "C",
    days: 3,
    critical: true,
  },
];

export const NO_PIN_EID = "100099";
export const PINNED_EID = "100002"; // has a pin, history and violations
export const PERFECT_EID = "100004";

export const byEid = (eid) => PLACES.find((p) => p.eid === eid);

// Three inspections per place: the latest matches the map pin, the older two are filler.
const inspections = PLACES.flatMap((p, i) => [
  {
    inspection_id: 9000 + i * 10 + 1,
    establishment_id: p.eid,
    inspection_date: daysAgo(p.days),
    score: p.score,
    grade: p.grade,
    ins_type_desc: "REGULAR",
  },
  {
    inspection_id: 9000 + i * 10 + 2,
    establishment_id: p.eid,
    inspection_date: daysAgo(p.days + 180),
    score: 95,
    grade: "A",
    ins_type_desc: "REGULAR",
  },
  {
    inspection_id: 9000 + i * 10 + 3,
    establishment_id: p.eid,
    inspection_date: daysAgo(p.days + 400),
    score: 0,
    grade: null,
    ins_type_desc: "FOLLOWUP",
  },
]);

const latestInspection = (eid) => inspections.find((r) => r.establishment_id === eid);

const violations = PLACES.filter((p) => p.critical).flatMap((p, i) => {
  const insp = latestInspection(p.eid);
  return [
    {
      violation_oid: 7000 + i * 10 + 1,
      inspection_id: insp.inspection_id,
      establishment_id: p.eid,
      inspection_date: insp.inspection_date,
      violation_desc: "Food held at improper temperature",
      insp_viol_comments: "Cold-holding unit at 48F.",
      critical_yn: "Y",
    },
    {
      violation_oid: 7000 + i * 10 + 2,
      inspection_id: insp.inspection_id,
      establishment_id: p.eid,
      inspection_date: insp.inspection_date,
      violation_desc: "Floors not clean",
      insp_viol_comments: "",
      critical_yn: "N",
    },
  ];
});

const pinned = PLACES.filter((p) => p.lon != null);

// Rows keyed by the PostgREST path the app requests (after /rest/v1/).
export const TABLES = {
  v_facility_map_feed: pinned.map((p) => ({
    establishment_id: p.eid,
    premise_name: p.name,
    address: p.address,
    lon: p.lon,
    lat: p.lat,
    inspection_date_recent: daysAgo(p.days),
    score_recent: p.score,
    grade_recent: p.grade,
  })),
  facilities: PLACES.map((p) => ({
    establishment_id: p.eid,
    facility_type: p.ft,
    subtype: p.st,
    address: p.address,
    city: p.address ? "LOUISVILLE" : null,
    state: p.address ? "KY" : null,
    zip: p.address ? "40202" : null,
  })),
  inspections,
  inspection_violations: violations,
  v_facility_details: PLACES.map((p) => ({
    establishment_id: p.eid,
    opening_date: "2015-06-01",
    facility_type: p.ft,
    subtype: p.st,
    address: p.address,
    city: p.address ? "LOUISVILLE" : null,
    state: p.address ? "KY" : null,
    zip: p.address ? "40202" : null,
    permit_number: p.eid,
    facility_type_description: "FOOD SERVICE ESTABLISHMENT",
    subtype_description: "FOOD SERVICE",
  })),
  v_inspection_types: [
    { ins_type_desc: "REGULAR", cnt: 12 },
    { ins_type_desc: "FOLLOWUP", cnt: 6 },
  ],
  v_latest_insp_per_type: inspections.map((r) => {
    const p = byEid(r.establishment_id);
    return { ...r, name: p.name, address: p.address, zip: p.address ? "40202" : null };
  }),
  "rpc/get_violation_flags": pinned.map((p) => ({
    establishment_id: p.eid,
    has_critical: !!p.critical,
    has_any: !!p.critical,
  })),
  // Flagged first (score under 85 or a critical violation), then newest, like the SQL.
  "rpc/get_whats_new": [PLACES[1], PLACES[5], PLACES[4], PLACES[0]].map((p) => ({
    establishment_id: p.eid,
    premise_name: p.name,
    address: p.address,
    score: p.score,
    grade: p.grade,
    inspection_date: daysAgo(p.days),
    critical_count: p.critical ? 1 : 0,
  })),
};
