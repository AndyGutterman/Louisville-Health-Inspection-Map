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
      // Over 240 characters, so the drawer cuts it short and shows "Read more".
      insp_viol_comments:
        "Cold-holding unit at 48F. Rice, cooked chicken and cut tomatoes in the reach-in " +
        "cooler measured between 46F and 50F. The person in charge said the unit was serviced " +
        "last week. All items were discarded and the unit was turned colder; it will be " +
        "rechecked at the follow-up inspection.",
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

// Bullitt County (lib/bullitt.js): only the latest inspection, plus a follow-up when there
// was one. The first two are as the county's sheet has them (the routine inspection
// undated); the third as Kentucky's portal has it, dated (routineDays). The database
// serves one source or the other (bullitt_results); the fixtures show both kinds.
const BULLITT_PLACES = [
  {
    eid: "bullitt-00000000e2e1",
    name: "Shepherdsville Test Diner",
    address: "100 N BUCKMAN ST",
    city: "SHEPHERDSVILLE",
    lon: -85.7158,
    lat: 37.9884,
    score: 94,
    violations: ["PROPER COLD HOLDING TEMPERATURES", "Food stored covered"],
    followUp: { days: 10, score: 100 },
  },
  {
    eid: "bullitt-00000000e2e2",
    name: "Mount Washington Test Grill",
    address: "200 MAIN ST",
    city: "MOUNT WASHINGTON",
    lon: -85.5458,
    lat: 38.05,
    score: 100,
    violations: [],
  },
  {
    eid: "bullitt-00000000e2e3",
    name: "Lebanon Junction Test Cafe",
    address: "300 MAIN ST",
    city: "LEBANON JUNCTION",
    lon: -85.7322,
    lat: 37.8346,
    score: 97,
    violations: ["Wiping cloths: properly used and stored"],
    routineDays: 3,
  },
];
export const BULLITT_EID = BULLITT_PLACES[0].eid;
export const BULLITT_PORTAL = BULLITT_PLACES[2];

const bullittInspections = BULLITT_PLACES.flatMap((p, i) => [
  {
    id: 500 + i * 10 + 1,
    establishment_id: p.eid,
    kind: "routine",
    inspection_date: p.routineDays != null ? daysAgo(p.routineDays) : null,
    score: p.score,
    violations: p.violations,
    first_seen: daysAgo(p.followUp ? 20 : 30),
    last_seen: daysAgo(1),
  },
  ...(p.followUp
    ? [
        {
          id: 500 + i * 10 + 2,
          establishment_id: p.eid,
          kind: "follow_up",
          inspection_date: daysAgo(p.followUp.days),
          score: p.followUp.score,
          violations: [],
          first_seen: daysAgo(8),
          last_seen: daysAgo(1),
        },
      ]
    : []),
]);

// Table View rows: Louisville's inspections, then Bullitt's (routine rows have no date).
const tableRows = [
  ...inspections.map((r) => {
    const p = byEid(r.establishment_id);
    return {
      region: "jefferson",
      ...r,
      name: p.name,
      address: p.address,
      city: p.address ? "LOUISVILLE" : null,
      zip: p.address ? "40202" : null,
    };
  }),
  ...bullittInspections.map((r) => {
    const p = BULLITT_PLACES.find((b) => b.eid === r.establishment_id);
    return {
      region: "bullitt",
      inspection_id: r.id,
      establishment_id: r.establishment_id,
      inspection_date: r.inspection_date,
      score: r.score,
      grade: null,
      ins_type_desc: r.kind === "follow_up" ? "FOLLOWUP" : "REGULAR",
      name: p.name,
      address: p.address,
      city: p.city,
      zip: null,
    };
  }),
];
export const BULLITT_NAME = BULLITT_PLACES[0].name;

const whatsNewRow = (p) => ({
  establishment_id: p.eid,
  premise_name: p.name,
  address: p.address,
  score: p.score,
  grade: p.grade,
  inspection_date: daysAgo(p.days),
  critical_count: p.critical ? 1 : 0, // deprecated column, still returned
  violation_count: p.critical ? 2 : 0,
  region: "jefferson",
  posted_date: null,
});

// Rows keyed by the PostgREST path the app requests (after /rest/v1/).
export const TABLES = {
  // Louisville's pins in one read (migration 20261122000000)...
  v_facility_map_pins: pinned.map((p) => ({
    establishment_id: p.eid,
    premise_name: p.name,
    address: p.address,
    city: "LOUISVILLE",
    state: "KY",
    zip: "40202",
    facility_type: p.ft,
    subtype: p.st,
    lon: p.lon,
    lat: p.lat,
    inspection_date_recent: daysAgo(p.days),
    score_recent: p.score,
    grade_recent: p.grade,
    has_any_violation: !!p.critical,
  })),
  // ...and the three reads the site falls back to on a database without that view.
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
  // Table View (both counties). The mock ignores or=/region filters, so every row comes
  // back whatever is searched; tests check the request for the filter itself.
  v_table_latest: tableRows,
  v_table_inspections: tableRows,
  "rpc/get_violation_flags": pinned.map((p) => ({
    establishment_id: p.eid,
    has_critical: !!p.critical,
    has_any: !!p.critical,
  })),
  v_bullitt_map_feed: BULLITT_PLACES.map((p) => ({
    establishment_id: p.eid,
    premise_name: p.name,
    address: p.address,
    city: p.city,
    lon: p.lon,
    lat: p.lat,
    score_recent: p.score,
    violation_count_recent: p.violations.length,
    follow_up_date: p.followUp ? daysAgo(p.followUp.days) : null,
    follow_up_score: p.followUp?.score ?? null,
    follow_up_violation_count: p.followUp ? 0 : null,
    // The sheet was first loaded 30 days ago; the diner's result appeared 20 days ago, so
    // its date is estimated. The grill's was there from the start (no estimate).
    routine_first_seen: daysAgo(p.followUp ? 20 : 30),
    tracking_since: daysAgo(30),
    routine_date: p.routineDays != null ? daysAgo(p.routineDays) : null,
  })),
  // Oldham (lib/portal.js): none in the fixtures yet.
  v_portal_map_feed: [],
  portal_inspections: [],
  bullitt_results: bullittInspections,
  bullitt_inspections: bullittInspections,
  // Failing first (grade C or score under 85), then newest, like the SQL. The Bullitt row
  // is a routine score posted to the sheet, so it has no inspection date.
  "rpc/get_whats_new": [
    ...[PLACES[1], PLACES[5]].map(whatsNewRow),
    {
      establishment_id: BULLITT_PLACES[0].eid,
      premise_name: BULLITT_PLACES[0].name,
      address: BULLITT_PLACES[0].address,
      score: 84,
      grade: null,
      inspection_date: null,
      critical_count: 0,
      violation_count: 2,
      region: "bullitt",
      posted_date: daysAgo(4),
    },
    ...[PLACES[4], PLACES[0]].map(whatsNewRow),
  ],
  "rpc/get_top_scores": [
    ...PLACES.filter((p) => p.score === 100 && p.lon != null).map((p) => ({
      establishment_id: p.eid,
      premise_name: p.name,
      address: p.address,
      score: 100,
      inspection_date: daysAgo(p.days),
      region: "jefferson",
      posted_date: null,
    })),
    {
      establishment_id: BULLITT_PLACES[1].eid,
      premise_name: BULLITT_PLACES[1].name,
      address: BULLITT_PLACES[1].address,
      score: 100,
      inspection_date: null,
      region: "bullitt",
      posted_date: daysAgo(6),
    },
  ],
};

// The Latest tab: the same rows as get_whats_new, newest first (undated Bullitt rows by the
// day they were posted), like the SQL.
const rowDate = (r) => r.inspection_date ?? r.posted_date ?? "";
TABLES["rpc/get_latest_inspections"] = [...TABLES["rpc/get_whats_new"]].sort(
  (a, b) => rowDate(b).localeCompare(rowDate(a)) || a.premise_name.localeCompare(b.premise_name),
);
export const NEWEST_EID = TABLES["rpc/get_latest_inspections"][0].establishment_id;
