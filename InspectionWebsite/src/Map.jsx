import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import maplibregl from "maplibre-gl";
import LearnPage, { LoginModal } from "./LearnPage.jsx";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { createClient } from "@supabase/supabase-js";
import InfoDrawer from "./InfoDrawer.jsx";
import TableView from "./TableView.jsx";
import FilterSearch from "./FilterSearch.jsx";
import { ScoreThresholdInline } from "./ScoreThreshold.jsx";
import { PIN_COLORS, CAT_COLORS } from "./Colors.jsx";
import * as AccessibleIcon from "@radix-ui/react-accessible-icon";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import FeedbackModal from "./FeedbackModal.jsx";
import AccountPage from "./AccountPage.jsx";
import { useAuth } from "./AuthContext.jsx";
import WhatsNew from "./WhatsNew.jsx";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const DRAW_ORDER = ["null", "green", "yellow", "zero", "red"];
const MIN_ZOOM = 11;

const SCORE_MIN = 1;
const SCORE_MAX = 99;
const RED_CAP = 98;
const YEL_CAP = 99;

function clampPins([r, y]) {
  r = Math.max(SCORE_MIN, Math.min(RED_CAP, Math.round(r)));
  y = Math.max(r + 1, Math.min(YEL_CAP, Math.round(y)));
  return [r, y];
}
const PRESETS = {
  loose: clampPins([75, 89]),
  balanced: clampPins([85, 94]),
  strict: clampPins([90, 96]),
};

const CATEGORY_SPECS = {
  restaurants: { label: "Restaurants", subs: [{ ft: 605, st: 11 }] },
  schools: { label: "Schools", subs: [{ ft: 605, st: 33 }] },
  daycare: { label: "Daycare", subs: [{ ft: 605, st: 31 }] },
  hospitals: { label: "Hospitals & Nursing", subs: [{ ft: 605, st: 32 }] },
  concessions: {
    label: "Concessions",
    subs: [
      { ft: 603, st: 51 },
      { ft: 603, st: 53 },
    ],
  },
  caterers_commissary: {
    label: "Caterers & Commissaries",
    subs: [
      { ft: 605, st: 42 },
      { ft: 605, st: 43 },
    ],
  },
  retail: {
    label: "Retail",
    subs: [
      { ft: 610, st: 61 },
      { ft: 610, st: 62 },
      { ft: 610, st: 63 },
      { ft: 610, st: 64 },
      { ft: 610, st: 65 },
      { ft: 610, st: 73 },
      { ft: 610, st: 212 },
      { ft: 607, st: 54 },
      { ft: 607, st: 55 },
      { ft: 605, st: 54 },
    ],
  },
  unknown: {
    label: "Other / Unknown",
    subs: [
      { ft: 605, st: 36 },
      { ft: 604, st: 16 },
      { ft: 605, st: 52 },
      { ft: 610, st: 73 },
    ],
  },
};

function classifyCategory(ft, st) {
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    if (key === "unknown") continue;
    if (spec.subs.some((p) => p.ft === ft && p.st === st)) return key;
  }
  return "unknown";
}

function buildInitialCatToggles() {
  const obj = {};
  for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
    const subs = {};
    for (const p of spec.subs) subs[`${p.ft}:${p.st}`] = true;
    obj[key] = { enabled: true, subs };
  }
  return obj;
}

const EDGE_ZONE = 24;
const SPURT_PX = 60;

function bandExprs([rMax, yMax]) {
  const GET = ["get", "score"];
  const GETN = ["coalesce", ["get", "score"], -999999];
  return {
    red: ["all", [">=", GETN, 1], ["<=", GETN, rMax]],
    yellow: ["all", [">=", GETN, rMax + 1], ["<=", GETN, yMax]],
    green: ["all", [">=", GETN, yMax + 1], ["<=", GETN, 100]],
    zero: ["==", GET, 0],
    null: ["==", GET, null],
  };
}

function formatDateSafe(val) {
  if (!val) return "n/a";
  if (typeof val === "string") {
    const m = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      return d.toLocaleDateString(undefined, { timeZone: "UTC" });
    }
  }
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString();
  } catch {
    return String(val);
  }
}

function coordKey([lon, lat]) {
  return `${lon.toFixed(6)}|${lat.toFixed(6)}`;
}

function buildWatchCircleGeoJSON(areas) {
  const features = areas
    .filter((a) => typeof a.center_lat === "number" && typeof a.center_lon === "number")
    .map((a) => {
      const radiusM = a.radius_miles * 1609.34;
      const N = 64;
      const coords = [];
      for (let i = 0; i <= N; i++) {
        const angle = (i * 2 * Math.PI) / N;
        const dLon = (radiusM / (111320 * Math.cos(a.center_lat * Math.PI / 180))) * Math.sin(angle);
        const dLat = (radiusM / 110540) * Math.cos(angle);
        coords.push([a.center_lon + dLon, a.center_lat + dLat]);
      }
      return {
        type: "Feature",
        properties: { id: a.id, label: a.label || `${a.radius_miles} mi`, radius_miles: a.radius_miles },
        geometry: { type: "Polygon", coordinates: [coords] },
      };
    });
  return { type: "FeatureCollection", features };
}

function buildCoordIndex(features) {
  const m = new globalThis.Map();
  for (const f of features) {
    const k = coordKey(f.geometry.coordinates);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return m;
}

// ─── Same-place detection ─────────────────────────────────────────────────────
// Detects pairs of nearby features that likely represent the same physical place
// under different permit records (e.g. a permit rename). We tag BOTH features
// with each other's info — no pins are removed or merged. Each pin remains
// fully independent with its own inspection history. The "similar nearby" note
// in the popup and drawer lets users navigate between them.

const COORD_SNAP       = 0.0005; // ~55m grid at Louisville latitude
const SAME_PLACE_MAX_M = 80;
const SAME_PLACE_MIN_SIM = 0.60;

function snapCoordKey([lon, lat]) {
  const slon = (Math.round(lon / COORD_SNAP) * COORD_SNAP).toFixed(4);
  const slat = (Math.round(lat / COORD_SNAP) * COORD_SNAP).toFixed(4);
  return `${slon}|${slat}`;
}

function distanceM([lon1, lat1], [lon2, lat2]) {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function extractLocationNumber(name) {
  const m = name.match(/#\s*(\d+)/);
  return m ? m[1] : null;
}

function isSubTenant(name) {
  return /@|at|inside|within/i.test(name);
}

const DEPT_WORDS = new Set([
  "gas", "deli", "pharmacy", "bakery", "cafe", "coffee", "express", "grill",
  "bar", "kitchen", "bistro", "market", "fuel", "floral", "optical", "vision",
  "salon", "spa", "food", "court", "stand", "kiosk", "counter", "liquor", "wine",
]);

function normalizeName(name) {
  if (!name) return [];
  return name
    .toLowerCase()
    .replace(/#\s*\d+|no\.?\s*\d+|\bunit\s+\w+|\bstore\s+\d+/gi, "")
    .replace(/[‘’\'']s?\b/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function tokensMatch(a, b) {
  if (a === b) return true;
  if (a.startsWith(b) || b.startsWith(a)) return true;
  if (Math.max(a.length, b.length) >= 6 && editDistance(a, b) <= 1) return true;
  return false;
}

function nameSimilarity(a, b) {
  if (isSubTenant(a) || isSubTenant(b)) return 0;
  const numA = extractLocationNumber(a);
  const numB = extractLocationNumber(b);
  if (numA !== null && numB !== null && numA !== numB) return 0;
  const ta = normalizeName(a);
  const tb = normalizeName(b);
  if (ta.length === 0 && tb.length === 0) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;
  const setA = new Set(ta), setB = new Set(tb);
  const extraTokens = [...ta.filter(w => !setB.has(w)), ...tb.filter(w => !setA.has(w))];
  if (extraTokens.length > 0 && extraTokens.every(w => DEPT_WORDS.has(w))) return 0;
  let matched = 0;
  const usedB = new Set();
  for (const wa of ta)
    for (let bi = 0; bi < tb.length; bi++)
      if (!usedB.has(bi) && tokensMatch(wa, tb[bi])) { matched++; usedB.add(bi); break; }
  const jaccard = matched / (ta.length + tb.length - matched);
  const shorter = Math.min(ta.length, tb.length);
  const containment = matched / shorter;
  const lr = Math.max(ta.length, tb.length) / shorter;
  return lr >= 1.5 ? Math.max(jaccard, containment * 0.85) : jaccard;
}

// Tags nearby similar-name features with each other's eid+name so the popup
// and drawer can show "may also be listed as" with a switch link.
// All features remain fully independent — no suppression, no history merging.
function tagSimilarNearby(features) {
  const bySnap = new globalThis.Map();
  for (const f of features) {
    const k = snapCoordKey(f.geometry.coordinates);
    if (!bySnap.has(k)) bySnap.set(k, []);
    bySnap.get(k).push(f);
  }

  // eid → [{eid, name}] of similar neighbours
  const similarMap = new globalThis.Map();

  for (const group of bySnap.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (distanceM(a.geometry.coordinates, b.geometry.coordinates) > SAME_PLACE_MAX_M) continue;
        const sim = nameSimilarity(a.properties.name, b.properties.name);
        if (sim < SAME_PLACE_MIN_SIM) continue;
        const eidA = a.properties.establishment_id;
        const eidB = b.properties.establishment_id;
        if (!similarMap.has(eidA)) similarMap.set(eidA, []);
        if (!similarMap.has(eidB)) similarMap.set(eidB, []);
        similarMap.get(eidA).push({ eid: eidB, name: b.properties.name });
        similarMap.get(eidB).push({ eid: eidA, name: a.properties.name });
        if (import.meta.env.DEV) {
          console.log(
            `[similar-nearby] "${a.properties.name}" (${eidA}) <-> ` +
            `"${b.properties.name}" (${eidB})  sim=${sim.toFixed(2)}`
          );
        }
      }
    }
  }

  if (similarMap.size === 0) return features;
  return features.map((f) => {
    const eid = f.properties.establishment_id;
    if (!similarMap.has(eid)) return f;
    return {
      ...f,
      properties: {
        ...f.properties,
        // JSON string: [{eid, name}, ...] of similar nearby permits
        similar_nearby: JSON.stringify(similarMap.get(eid)),
      },
    };
  });
}


function OverlapNav({ index, total, onPrev, onNext }) {
  return (
    <div
      className="multi-nav"
      role="group"
      aria-label={`Overlapping locations, item ${index + 1} of ${total}`}
    >
      <button type="button" className="iconbtn" onClick={onPrev}>
        <AccessibleIcon.Root label="Previous location">
          <ChevronLeftIcon aria-hidden />
        </AccessibleIcon.Root>
      </button>
      <span aria-live="polite" className="multi-count">
        {index + 1} / {total}
      </span>
      <button type="button" className="iconbtn" onClick={onNext}>
        <AccessibleIcon.Root label="Next location">
          <ChevronRightIcon aria-hidden />
        </AccessibleIcon.Root>
      </button>
    </div>
  );
}

export default function Map(props) {
  const { user } = useAuth();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const onMapReadyRef = useRef(props.onMapReady);
  useEffect(() => { onMapReadyRef.current = props.onMapReady; }, [props.onMapReady]);

  const hoverPopupRef = useRef(null);
  const pinnedPopupRef = useRef(null);
  const pinnedReactRootRef = useRef(null);
  // Exposed so TableView can drive map popups from row hover/click
  const tableHoverPopupRef  = useRef(null); // tracks table-driven hover popup
  const featureByEidRef     = useRef({});   // establishment_id → feature, built after geoData loads
  const lastHoverId = useRef(null);
  const pinnedFeatureRef = useRef(null);
  const multiHitsRef = useRef(null);
  const docCloseHandlerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const coordIndexRef = useRef(new globalThis.Map());

  useEffect(() => {
    const headerEl =
      document.querySelector(".app-header, .site-header, header") || null;

    const setVars = () => {
      const h = headerEl ? Math.round(headerEl.getBoundingClientRect().height) : 72;
      document.documentElement.style.setProperty("--mobile-header-h", `${h}px`);
      document.documentElement.style.setProperty("--header-h", `${h}px`);

      const sw = document.querySelector(".header-search .search-wrap");
      const left = sw ? Math.round(sw.getBoundingClientRect().left) : 16;
      document.documentElement.style.setProperty("--controls-left", `${left}px`);
    };

    setVars();
    window.addEventListener("resize", setVars);
    return () => window.removeEventListener("resize", setVars);
  }, []);

  const [geoData, setGeoData] = useState(null);

  const [selected, setSelected] = useState(null);
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  const [history, setHistory] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const loadSeqRef = useRef(0);

  const [facDetails, setFacDetails] = useState(null);
  const [facDetailsFor, setFacDetailsFor] = useState(null);

  const [searchTerm, setSearchTerm] = useState("");

  const [pins, setPins] = useState(PRESETS.balanced);
  const [preset, setPreset] = useState("balanced");
  const applyPreset = (name) => {
    const next = PRESETS[name];
    if (!next) return;
    setPins(next);
    setPreset(name);
  };
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);
  useEffect(() => {
    const match = Object.entries(PRESETS).find(
      ([, v]) => v[0] === pins[0] && v[1] === pins[1],
    );
    setPreset(match ? match[0] : null);
  }, [pins]);

  const [showMissing, setShowMissing] = useState(false);
  const [showRedPins, setShowRedPins] = useState(true);
  const [showYellowPins, setShowYellowPins] = useState(true);
  const [showGreenPins, setShowGreenPins] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [catToggles, setCatToggles] = useState(buildInitialCatToggles());

  const [fabHidden, setFabHidden] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [bandsOpen, setBandsOpen] = useState(false);

  // Persist table dimensions across open/close so reopening remembers last size
  const [tableH, setTableH] = useState(null); // null = use TableView default
  const [tableW, setTableW] = useState(null);

  // What's New panel — default open on desktop, closed on mobile
  // What's New panel — collapsed by default (shows flame icon trigger)
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  // Watchlist areas (radius bubbles) — only loaded when user is signed in
  const [watchAreas, setWatchAreas] = useState([]);
  const watchAreasRef = useRef([]);
  useEffect(() => {
    watchAreasRef.current = watchAreas;
  }, [watchAreas]);

  useEffect(() => {
    if (!user) { setWatchAreas([]); return; }
    supabase
      .from("watchlist_areas")
      .select("id, label, center_lat, center_lon, radius_miles")
      .eq("user_id", user.id)
      .then(({ data }) => setWatchAreas(data || []));
  }, [user]);

  // Which panel sits on top when both are open ('drawer' | 'table')
  const [frontPanel, setFrontPanel] = useState("drawer");

  // Date filter — "Since X" dropdown, shared with Learn page ViolationDatabase
  const DATE_FILTER_OPTS = [
    { key: "1w",  label: "1 week",   days: 7 },
    { key: "1mo", label: "1 month",  days: 30 },
    { key: "3mo", label: "3 months", days: 91 },
    { key: "6mo", label: "6 months", days: 182 },
    { key: "1yr", label: "1 year",   days: 365 },
    { key: "all", label: "All time", days: null },
  ];
  const [dateFilterKey, setDateFilterKey] = useState("6mo");
  const mapCutoffDate = React.useMemo(() => {
    const opt = DATE_FILTER_OPTS.find((o) => o.key === dateFilterKey);
    if (!opt || !opt.days) return null;
    const d = new Date();
    d.setDate(d.getDate() - opt.days);
    return d.toISOString().slice(0, 10);
  }, [dateFilterKey]);

  // Page routing
  const [page, setPage] = useState("map");
  const [loginOpen, setLoginOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const inEdgeRef = useRef(false);

  const isHoverCapableRef = useRef(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(hover: hover)").matches
      : false,
  );

  const suppressDocCloseRef = useRef(false);

  const GEO_CACHE_KEY = "lfs_geodata_v1";
  const GEO_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

  function buildFeatureIndexes(featureList) {
    coordIndexRef.current = buildCoordIndex(featureList);
    const byEid = {};
    for (const f of featureList) byEid[f.properties.establishment_id] = f;
    featureByEidRef.current = byEid;
  }

  React.useEffect(() => {
    (async () => {
      // sessionStorage cache — skipped with ?bust in URL (dev escape hatch)
      const bustCache = new URLSearchParams(window.location.search).has("bust");
      if (!bustCache) {
        try {
          const raw = sessionStorage.getItem(GEO_CACHE_KEY);
          if (raw) {
            const cached = JSON.parse(raw);
            if (cached?.ts && Date.now() - cached.ts < GEO_CACHE_TTL && cached.data) {
              buildFeatureIndexes(cached.data.features);
              setGeoData(cached.data);
              return;
            }
          }
        } catch { /* cache miss — proceed to fetch */ }
      }

      const { count, error: headErr } = await supabase
        .from("v_facility_map_feed")
        .select("*", { head: true, count: "exact" });
      if (headErr) {
        console.error(headErr);
        return;
      }

      const pageSize = 1000;
      let allRows = [];
      for (let offset = 0; offset < count; offset += pageSize) {
        const to = Math.min(count - 1, offset + pageSize - 1);
        const { data, error } = await supabase
          .from("v_facility_map_feed")
          .select(
            "establishment_id,premise_name,address,lon,lat,inspection_date_recent,score_recent,grade_recent",
          )
          .range(offset, to);
        if (error) {
          console.error(error);
          return;
        }
        allRows = allRows.concat(data);
      }

      let metaById = new globalThis.Map();
      try {
        const { count: facCount } = await supabase
          .from("facilities")
          .select("*", { head: true, count: "exact" });
        const page2 = 1000;
        for (let off = 0; off < (facCount || 0); off += page2) {
          const to2 = Math.min((facCount || 0) - 1, off + page2 - 1);
          const { data: facRows, error: facErr } = await supabase
            .from("facilities")
            .select(
              "establishment_id, facility_type, subtype, address, city, state, zip",
            )
            .range(off, to2);
          if (facErr) {
            console.error("facilities meta fetch error", facErr);
            break;
          }
          for (const f of (facRows || []))
            metaById.set(f.establishment_id, {
              ft: f.facility_type,
              st: f.subtype,
              zip: f.zip || null,
              address: f.address || null,
              city: f.city || null,
              state: f.state || null,
            });
        }
      } catch (e) {
        console.error("facilities meta lookup failed", e);
      }

      const features = allRows
        .filter((r) => typeof r.lon === "number" && typeof r.lat === "number")
        .map((r, i) => {
          const meta = metaById.get(r.establishment_id) || {};
          const ft = typeof meta.ft === "number" ? meta.ft : null;
          const st = typeof meta.st === "number" ? meta.st : null;
          const fullAddr =
            [meta?.address || r.address, meta?.city, meta?.state]
              .filter(Boolean)
              .join(", ") + (meta?.zip ? ` ${meta.zip}` : "");
          const cat =
            ft != null && st != null ? classifyCategory(ft, st) : "unknown";

          if (cat === "unknown" && ft != null && st != null) {
            console.warn("Unmapped facility (category filters)", {
              establishment_id: r.establishment_id,
              name: r.premise_name,
              address: r.address,
              address_full: fullAddr,
              facility_type: ft,
              subtype: st,
            });
          }

          return {
            type: "Feature",
            id: i,
            geometry: { type: "Point", coordinates: [r.lon, r.lat] },
            properties: {
              establishment_id: r.establishment_id,
              name: r.premise_name,
              address: r.address,
              address_full: fullAddr,
              zip: meta?.zip || null,
              date: r.inspection_date_recent,
              score: r.score_recent,
              grade: r.grade_recent,
              facility_type: ft,
              subtype: st,
              cat,
            },
          };
        });

      const latestMap = features.reduce((acc, feat) => {
        const eid = feat.properties.establishment_id;
        const prev = acc[eid];
        if (
          !prev ||
          (feat.properties.date && feat.properties.date > prev.properties.date)
        )
          acc[eid] = feat;
        return acc;
      }, {});
      const featureList = tagSimilarNearby(Object.values(latestMap));

      const geoDataObj = { type: "FeatureCollection", features: featureList };

      try {
        sessionStorage.setItem(GEO_CACHE_KEY, JSON.stringify({ data: geoDataObj, ts: Date.now() }));
      } catch { /* quota exceeded — ignore */ }

      buildFeatureIndexes(featureList);
      setGeoData(geoDataObj);
    })();
  }, []);

  function isMapReady() {
    const m = mapRef.current;
    if (!m || !m.isStyleLoaded()) return false;
    return DRAW_ORDER.every((k) => m.getLayer(`points-${k}`));
  }
  function applyFilterWhenReady() {
    const m = mapRef.current;
    if (!m) return;
    if (isMapReady()) applyFilter(m);
    else
      m.once("idle", () => {
        if (isMapReady()) applyFilter(m);
      });
  }

  // Hoisted from map.on('load') so table rows can trigger drawer
  const beginDrawerLoad = async (eid, p) => {
    const seq = ++loadSeqRef.current;
    setDrawerLoading(true);
    setHistory(null);
    setHistoryFor(null);
    setFacDetails(null);
    setFacDetailsFor(null);

    const { data: insp, error: inspErr } = await supabase
      .from("inspections")
      .select("inspection_id, inspection_date, score, grade, ins_type_desc, establishment_id")
      .eq("establishment_id", eid)
      .order("inspection_date", { ascending: false })
      .order("inspection_id", { ascending: false });

    if (inspErr) {
      console.error("history fetch error", inspErr);
      if (seq !== loadSeqRef.current) return;
      setDrawerLoading(false);
      return;
    }

    const { data: viols, error: vErr } = await supabase
      .from("inspection_violations")
      .select("violation_oid, inspection_id, inspection_date, violation_desc, insp_viol_comments, critical_yn, establishment_id")
      .eq("establishment_id", eid);

    if (vErr) console.error("violations fetch error", vErr);
    if (seq !== loadSeqRef.current) return;

    const byId = new globalThis.Map();
    const byDate = new globalThis.Map();
    for (const v of viols || []) {
      if (v.inspection_id != null) {
        if (!byId.has(v.inspection_id)) byId.set(v.inspection_id, []);
        byId.get(v.inspection_id).push(v);
      }
      if (v.inspection_date) {
        if (!byDate.has(v.inspection_date)) byDate.set(v.inspection_date, []);
        byDate.get(v.inspection_date).push(v);
      }
    }
    const mergedDesc = (insp || []).map((r) => {
      const viaId = byId.get(r.inspection_id) || [];
      const viaDate = byDate.get(r.inspection_date) || [];
      const seen = new Set();
      const violations = [];
      for (const x of [...viaId, ...viaDate]) {
        const k = x.violation_oid || `${x.inspection_id}-${x.violation_desc}`;
        if (!seen.has(k)) {
          seen.add(k);
          violations.push(x);
        }
      }
      return { ...r, violations };
    });

    const headerRow = (() => {
      const byExact = mergedDesc.find(
        (r) =>
          r.inspection_date === p.date &&
          (r.score ?? null) === (p.score ?? null) &&
          (r.grade ?? null) === (p.grade ?? null),
      );
      if (byExact) return byExact;
      const byDate = mergedDesc.find((r) => r.inspection_date === p.date);
      if (byDate) return byDate;
      const latestNonZero = mergedDesc.find((r) => (r.score ?? 0) > 0);
      return latestNonZero || mergedDesc[0] || null;
    })();

    // Parse similar-nearby data for the drawer switch links
    const similarNearby = (() => {
      try { return JSON.parse(p.similar_nearby || "[]"); }
      catch { return []; }
    })();

    const selectedData = headerRow
      ? {
          establishment_id: eid,
          name: p.name,
          address: p.address,
          inspectionDate: formatDateSafe(headerRow.inspection_date),
          score: headerRow.score ?? null,
          grade: headerRow.grade ?? null,
          _displayedInspectionId: headerRow.inspection_id,
          similarNearby,
          metaTitle:
            (headerRow.score ?? 0) > 0
              ? "Most recent inspection with a non-zero score. Newer zero-score visits appear below as N/A."
              : "",
        }
      : {
          establishment_id: eid,
          name: p.name,
          address: p.address,
          inspectionDate: formatDateSafe(p.date),
          score: p.score ?? null,
          grade: p.grade ?? null,
          _displayedInspectionId: null,
          similarNearby,
          meta: null,
        };

    let details = null;
    let fullAddress = null;
    {
      // Single query via v_facility_details (joins facilities + facility_categories)
      const { data: fac, error: facErr } = await supabase
        .from("v_facility_details")
        .select(
          "opening_date, facility_type, subtype, address, city, state, zip, permit_number, facility_type_description, subtype_description",
        )
        .eq("establishment_id", eid)
        .maybeSingle();

      if (facErr) console.error("v_facility_details fetch error", facErr);

      details = {
        opening_date: fac?.opening_date ? formatDateSafe(fac.opening_date) : null,
        facility_type: fac?.facility_type_description ?? fac?.facility_type ?? null,
        subtype: fac?.subtype_description ?? fac?.subtype ?? null,
        permit_number: fac?.permit_number ?? null,
      };
      fullAddress =
        [fac?.address || p.address, fac?.city, fac?.state]
          .filter(Boolean)
          .join(", ") + (fac?.zip ? ` ${fac.zip}` : "");
    }

    setSelected({
      ...selectedData,
      address: fullAddress || selectedData.address,
    });
    setHistory(mergedDesc);
    setHistoryFor(eid);
    setFacDetails(details);
    setFacDetailsFor(eid);
    setDrawerLoading(false);
  };

  React.useEffect(() => {
    if (!geoData || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [-85.75, 38.25],
      zoom: MIN_ZOOM,
      maxBounds: [
        [-86.4, 37.7],
        [-85.0, 38.7],
      ],
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("facilities", { type: "geojson", data: geoData });

      const basePaint = {
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          window.innerWidth <= 600 ? 4 : 6,
          11,
          window.innerWidth <= 600 ? 8 : 10.5,
          14,
          window.innerWidth <= 600 ? 12 : 14,
          17,
          window.innerWidth <= 600 ? 16 : 18,
        ],
        "circle-opacity": 0.9,
        "circle-stroke-width": 2,
        "circle-stroke-color": "rgba(0,0,0,0.4)",
        "circle-blur": 0.25,
      };

      const exprs = bandExprs(pinsRef.current);
      for (const key of DRAW_ORDER) {
        map.addLayer({
          id: `points-${key}`,
          type: "circle",
          source: "facilities",
          paint: { ...basePaint, "circle-color": PIN_COLORS[key] ?? PIN_COLORS.green },
          filter: exprs[key],
        });
      }

      const layerIds = DRAW_ORDER.map((k) => `points-${k}`);
      const styleZ = (() => {
        let idx = null;
        return (layerId) => {
          if (!idx) {
            const layers = (map.getStyle()?.layers) || [];
            idx = new globalThis.Map(layers.map((l, i) => [l.id, i]));
          }
          return idx.get(layerId) ?? -1;
        };
      })();

      // Red/yellow pins get a pixel "bonus" subtracted from their effective
      // distance so they win ties — and even beat nearby green pins by up to
      // the bonus amount. Red > yellow > everything else.
      const colorBonus = (f) => {
        const layerId = f.layer?.id || "";
        if (layerId === "points-red")    return 10;
        if (layerId === "points-yellow") return 5;
        return 0;
      };

      const nearestOf = (point, feats) => {
        let best = null, bestEff = Infinity;
        for (const f of feats) {
          const p = map.project(f.geometry.coordinates);
          const d = Math.hypot(p.x - point.x, p.y - point.y);
          const eff = d - colorBonus(f);
          if (eff < bestEff) { best = f; bestEff = eff; }
        }
        return best;
      };

      const groupAtPixel = (point) => {
        const hits = featuresAtPixel(point);
        if (!hits.length) return { feature: null, group: [] };
        const f = nearestOf(point, hits);
        const p0 = map.project(f.geometry.coordinates);
        const group = hits.filter((h) => {
          const p = map.project(h.geometry.coordinates);
          return Math.hypot(p.x - p0.x, p.y - p0.y) < 0.9; // cluster same-screen overlaps
        });
        return { feature: f, group };
      };

      // Use a small box so overlapping/nearby pins are all found,
      // then nearestOf() applies red>yellow>green priority correctly.
      const featuresAtPixel = (point, px = 12) =>
        map.queryRenderedFeatures(
          [
            [point.x - px, point.y - px],
            [point.x + px, point.y + px],
          ],
          { layers: layerIds },
        );

      const screenKey = (feature) => {
        const p = map.project(feature.geometry.coordinates);
        return `${Math.round(p.x)}|${Math.round(p.y)}`;
      };

      const nearestFeature = (point, px = 14) => {
        const box = [
          [point.x - px, point.y - px],
          [point.x + px, point.y + px],
        ];
        const hits = map.queryRenderedFeatures(box, { layers: layerIds });
        if (!hits.length) return null;
        let best = hits[0], bestEff = Infinity;
        for (const h of hits) {
          const p = map.project(h.geometry.coordinates);
          const d = Math.hypot(p.x - point.x, p.y - point.y);
          const eff = d - colorBonus(h);
          if (eff < bestEff) { bestEff = eff; best = h; }
        }
        return best;
      };

      const colorForScore = (score) => {
        const [rMax, yMax] = pinsRef.current;
        if (score == null) return PIN_COLORS.null;
        if (score === 0) return PIN_COLORS.zero;
        if (score <= rMax) return PIN_COLORS.red;
        if (score <= yMax) return PIN_COLORS.yellow;
        return PIN_COLORS.green;
      };

      const renderHTML = (p, overlapCount) => {
        const scoreText = p.score === 0 || p.score == null ? "N/A" : p.score;
        const addr = p.address_full || p.address || "";
        const overlap =
          overlapCount && overlapCount > 1
            ? `<div class="overlap-badge" aria-live="polite">${overlapCount} locations here</div>`
            : "";
        // Similar-nearby note in popup
        const aliasNote = (() => {
          try {
            const nearby = JSON.parse(p.similar_nearby || "[]");
            if (!nearby.length) return "";
            const list = nearby.map((n) => `<em>${n.name}</em>`).join(", ");
            return `<div style="margin-top:5px;font-size:11px;color:rgba(255,255,255,0.45);border-top:1px solid rgba(255,255,255,0.08);padding-top:4px">⚠ May also be listed as: ${list}</div>`;
          } catch { return ""; }
        })();
        return `<div class="popup-content" style="font-size:14px;max-width:240px">
          <strong>${p.name}</strong><br/>
          <small>${addr}</small><br/>
          <small>Inspected: ${formatDateSafe(p.date)}</small><br/>
          Score: ${scoreText}${p.grade ? ` (${p.grade})` : ""}
          ${aliasNote}
          ${overlap}
        </div>`;
      };

      const showPinnedPopup = (feature) => {
        const html = renderHTML(feature.properties);
        if (!pinnedPopupRef.current) {
          pinnedPopupRef.current = new maplibregl.Popup({
            anchor: "bottom",
            offset: [0, -14],
            closeButton: false,
            closeOnMove: false,
            closeOnClick: false,
          })
            .setLngLat(feature.geometry.coordinates)
            .setHTML(html)
            .addTo(mapRef.current);
        } else {
          pinnedPopupRef.current.setLngLat(feature.geometry.coordinates).setHTML(html);
        }
        pinnedFeatureRef.current = feature;
        wirePopupInteractions(pinnedPopupRef.current, feature);
      };

      const wirePopupInteractions = (popup, feature) => {
        const root = popup.getElement();
        const tip = root?.querySelector(".maplibregl-popup-tip");
        if (tip) tip.style.borderTopColor = colorForScore(feature.properties.score);

        const content = root?.querySelector(".popup-content");
        if (content) {
          content.onclick = (ev) => {
            ev.stopPropagation();
            const p = feature.properties;
            beginDrawerLoad(p.establishment_id, p);
          };
        }
      };

      const showGroupPopup = (features, idx) => {
        if (!features?.length) return;
        const f = features[idx];

        const html =
          renderHTML(f.properties, features.length) + `<div id="overlap-nav-root"></div>`;

        if (!pinnedPopupRef.current) {
          pinnedPopupRef.current = new maplibregl.Popup({
            anchor: "bottom",
            offset: [0, -14],
            closeButton: false,
            closeOnMove: false,
            closeOnClick: false,
          })
            .setLngLat(f.geometry.coordinates)
            .setHTML(html)
            .addTo(mapRef.current);
        } else {
          pinnedPopupRef.current.setLngLat(f.geometry.coordinates).setHTML(html);
        }

        pinnedFeatureRef.current = f;
        multiHitsRef.current = { features, i: idx, anchor: f.geometry.coordinates };

        const rootEl = pinnedPopupRef.current.getElement();
        rootEl.tabIndex = 0;

        const navHost = rootEl.querySelector("#overlap-nav-root");
        if (pinnedReactRootRef.current) {
          pinnedReactRootRef.current.unmount();
          pinnedReactRootRef.current = null;
        }
        pinnedReactRootRef.current = ReactDOM.createRoot(navHost);
        const go = (dir) => {
          const cur = multiHitsRef.current;
          if (!cur) return;
          const n = cur.features.length;
          cur.i = (cur.i + (dir === "next" ? 1 : -1) + n) % n;
          showGroupPopup(cur.features, cur.i);
        };

        pinnedReactRootRef.current.render(
          <OverlapNav
            index={idx}
            total={features.length}
            onPrev={() => go("prev")}
            onNext={() => go("next")}
          />
        );

        if (!rootEl.dataset.navBound) {
          rootEl.addEventListener(
            "wheel",
            (ev) => {
              ev.stopPropagation();
              const cur = multiHitsRef.current;
              if (!cur) return;
              const n = cur.features.length;
              cur.i = (cur.i + (ev.deltaY > 0 ? 1 : -1) + n) % n;
              showGroupPopup(cur.features, cur.i);
            },
            { passive: true },
          );
          rootEl.addEventListener("keydown", (ev) => {
            const cur = multiHitsRef.current;
            if (!cur) return;
            if (ev.key === "ArrowRight") {
              ev.preventDefault();
              cur.i = (cur.i + 1) % cur.features.length;
              showGroupPopup(cur.features, cur.i);
            }
            if (ev.key === "ArrowLeft") {
              ev.preventDefault();
              cur.i = (cur.i - 1 + cur.features.length) % cur.features.length;
              showGroupPopup(cur.features, cur.i);
            }
          });
          rootEl.dataset.navBound = "1";
        }

        rootEl.focus({ preventScroll: true });
        wirePopupInteractions(pinnedPopupRef.current, f);
      };

      const showHoverPopup = (feature, overlapCount) => {
        const html = renderHTML(feature.properties, overlapCount);
        if (!hoverPopupRef.current) {
          hoverPopupRef.current = new maplibregl.Popup({
            anchor: "bottom",
            offset: [0, -14],
            closeButton: false,
            closeOnMove: false,
            closeOnClick: false,
          })
            .setLngLat(feature.geometry.coordinates)
            .setHTML(html)
            .addTo(mapRef.current);
        } else {
          hoverPopupRef.current.setLngLat(feature.geometry.coordinates).setHTML(html);
        }
        wirePopupInteractions(hoverPopupRef.current, feature);
      };

      const onHover = (e) => {
        const { feature: f, group } = groupAtPixel(e.point);
        if (!f) return;
        if (f.id === lastHoverId.current) return;
        lastHoverId.current = f.id;
        showHoverPopup(f, group.length || 1);
      };

      const onLeave = () => {
        lastHoverId.current = null;
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = null;
      };

      const onClick = (e) => {
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = null;
        lastHoverId.current = null;

        const { feature: f, group } = groupAtPixel(e.point);
        if (!f) return;

        if (group.length > 1) {
          const ordered = group.slice().sort((a, b) => a.id - b.id);
          showGroupPopup(ordered, 0);
          return;
        }

        showPinnedPopup(f);
        if (selectedRef.current && isHoverCapableRef.current) {
          const p = f.properties;
          beginDrawerLoad(p.establishment_id, p);
        }
      };

      for (const id of layerIds) {
        map.on("mousemove", id, onHover);
        map.on("mouseleave", id, onLeave);
        map.on("mousedown", id, () => {
          suppressDocCloseRef.current = true;
        });
        map.on("click", id, onClick);
        map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
      }

      map.on("dragstart", () => {
        isDraggingRef.current = true;
      });
      map.on("dragend", () => {
        isDraggingRef.current = false;
      });

      map.on("click", (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: layerIds });
        const insidePinned =
          pinnedPopupRef.current &&
          pinnedPopupRef.current.getElement()?.contains(e.originalEvent.target);
        const insideHover =
          hoverPopupRef.current &&
          hoverPopupRef.current.getElement()?.contains(e.originalEvent.target);

        if (!hits.length && !insidePinned && !insideHover) {
          pinnedReactRootRef.current?.unmount();
          pinnedReactRootRef.current = null;

          pinnedPopupRef.current?.remove();
          pinnedPopupRef.current = null;
          pinnedFeatureRef.current = null;
          hoverPopupRef.current?.remove();
          hoverPopupRef.current = null;
          lastHoverId.current = null;
          setSelected(null);
          setHistory(null);
          setHistoryFor(null);
          setFacDetails(null);
          setFacDetailsFor(null);
          setDrawerLoading(false);
          loadSeqRef.current++;
        }
      });

      const outsideClose = (ev) => {
        if (suppressDocCloseRef.current) {
          suppressDocCloseRef.current = false;
          return;
        }
        if (isDraggingRef.current) return;
        const p1 = pinnedPopupRef.current?.getElement();
        const p2 = hoverPopupRef.current?.getElement();
        if ((p1 && p1.contains(ev.target)) || (p2 && p2.contains(ev.target))) return;
        if (document.querySelector(".bands.open")) return;
        if (document.querySelector(".control-card")?.contains(ev.target)) return;
        if (document.querySelector(".info-drawer")?.contains(ev.target)) return;
        if (document.querySelector(".table-panel")?.contains(ev.target)) return;
        if (document.querySelector(".table-toggle-btn")?.contains(ev.target)) return;

        pinnedReactRootRef.current?.unmount();
        pinnedReactRootRef.current = null;

        pinnedPopupRef.current?.remove();
        pinnedPopupRef.current = null;
        pinnedFeatureRef.current = null;
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = null;
        lastHoverId.current = null;
        setSelected(null);
        setHistory(null);
        setHistoryFor(null);
        setFacDetails(null);
        setFacDetailsFor(null);
        setDrawerLoading(false);
        loadSeqRef.current++;
      };
      document.addEventListener("click", outsideClose, true);
      docCloseHandlerRef.current = outsideClose;

      applyFilter(map);

      // Signal the splash screen that the map is ready
      onMapReadyRef.current?.();
    });

    return () => {
      if (docCloseHandlerRef.current) {
        document.removeEventListener("click", docCloseHandlerRef.current, true);
        docCloseHandlerRef.current = null;
      }
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;

      pinnedReactRootRef.current?.unmount();
      pinnedReactRootRef.current = null;

      pinnedPopupRef.current?.remove();
      pinnedPopupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geoData]);

  React.useEffect(() => {
    if (mapRef.current) applyFilterWhenReady();
  }, [
    pins,
    showMissing,
    searchTerm,
    showRedPins,
    showYellowPins,
    showGreenPins,
    catToggles,
    mapCutoffDate,
  ]);

  React.useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.resize();
    const t = setTimeout(() => m.resize(), 320);
    return () => clearTimeout(t);
  }, [bandsOpen]);

  // Sync watchlist area bubbles into MapLibre whenever they change
  React.useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const apply = () => {
      const geoJSON = buildWatchCircleGeoJSON(watchAreas);
      const src = m.getSource("watch-areas");
      if (src) {
        src.setData(geoJSON);
      } else {
        m.addSource("watch-areas", { type: "geojson", data: geoJSON });
        m.addLayer({
          id: "watch-areas-fill",
          type: "fill",
          source: "watch-areas",
          paint: {
            "fill-color": "#34a853",
            "fill-opacity": 0.08,
          },
        });
        m.addLayer({
          id: "watch-areas-line",
          type: "line",
          source: "watch-areas",
          paint: {
            "line-color": "#34a853",
            "line-width": 2,
            "line-opacity": 0.55,
          },
        });

        // Click bubble to show popup with label + radius presets
        m.on("click", "watch-areas-fill", (e) => {
          const props = e.features?.[0]?.properties;
          if (!props) return;
          const RADIUS_OPTIONS = [5, 10, 15, 25];
          const html = `
            <div style="font-size:13px;min-width:180px">
              <strong>${props.label}</strong>
              <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
                ${RADIUS_OPTIONS.map((r) =>
                  `<button
                    data-areaid="${props.id}" data-radius="${r}"
                    style="padding:3px 10px;border-radius:999px;font-size:.72rem;font-weight:700;
                      background:${props.radius_miles === r ? "rgba(52,168,83,0.24)" : "rgba(255,255,255,0.08)"};
                      border:1px solid ${props.radius_miles === r ? "rgba(52,168,83,0.45)" : "rgba(255,255,255,0.14)"};
                      color:${props.radius_miles === r ? "#6fcf8a" : "rgba(255,255,255,0.70)"};
                      cursor:pointer"
                  >${r} mi</button>`
                ).join("")}
              </div>
            </div>`;

          const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: false })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(m);

          popup.getElement()?.addEventListener("click", async (ev) => {
            const btn = ev.target.closest("[data-areaid]");
            if (!btn) return;
            const areaId = btn.dataset.areaid;
            const radius = parseInt(btn.dataset.radius, 10);
            await supabase.from("watchlist_areas")
              .update({ radius_miles: radius, updated_at: new Date().toISOString() })
              .eq("id", areaId);
            setWatchAreas((prev) =>
              prev.map((a) => a.id === areaId ? { ...a, radius_miles: radius } : a)
            );
            popup.remove();
          });
        });
        m.on("mouseenter", "watch-areas-fill", () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", "watch-areas-fill", () => { m.getCanvas().style.cursor = ""; });
      }
    };

    if (m.isStyleLoaded()) {
      apply();
    } else {
      m.once("idle", apply);
    }
  }, [watchAreas]);

  const [draggingPins, setDraggingPins] = useState(false);
  React.useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const stopWheel = (e) => e.preventDefault();
    if (draggingPins) {
      m.dragPan.disable();
      m.scrollZoom.disable();
      m.boxZoom.disable();
      m.keyboard.disable();
      document.body.style.overflow = "hidden";
      window.addEventListener("wheel", stopWheel, { passive: false });
    }
    return () => {
      window.removeEventListener("wheel", stopWheel);
      document.body.style.overflow = "";
      m.dragPan.enable();
      m.scrollZoom.enable();
      m.boxZoom.enable();
      m.keyboard.enable();
    };
  }, [draggingPins]);

  const isInDeadzone = (x, y) => {
    const M = 8;
    const els = [
      document.querySelector(".fab-scores"),
      document.querySelector(".control-card"),
      document.querySelector(".app-header"),
      document.querySelector(".info-drawer"),
      document.querySelector(".table-panel"),
      document.querySelector(".wb2"),
    ].filter(Boolean);
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - M && x <= r.right + M && y >= r.top - M && y <= r.bottom + M) return true;
    }
    return false;
  };
  const spurtDisabled = () => !mapRef.current || bandsOpen || draggingPins;

  React.useEffect(() => {
    const onMove = (e) => {
      let dx = 0,
        dy = 0;
      if (e.clientX <= EDGE_ZONE) dx = -1;
      else if (e.clientX >= window.innerWidth - EDGE_ZONE) dx = 1;
      if (e.clientY <= EDGE_ZONE) dy = -1;
      else if (e.clientY >= window.innerHeight - EDGE_ZONE) dy = 1;
      const nearEdge = dx !== 0 || dy !== 0;
      const active =
        nearEdge && !spurtDisabled() && e.buttons === 0 && !isInDeadzone(e.clientX, e.clientY);
      if (active && !inEdgeRef.current) {
        mapRef.current.panBy([dx * 60, dy * 60], { duration: 240 });
        inEdgeRef.current = true;
      }
      if (!active) inEdgeRef.current = false;
    };
    const reset = () => {
      inEdgeRef.current = false;
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", reset);
      window.removeEventListener("blur", reset);
    };
  }, [bandsOpen, draggingPins]);

  function applyFilter(map) {
    const exprs = bandExprs(pins);
    const term = searchTerm.trim().toLowerCase();

    const haystack = [
      "downcase",
      [
        "concat",
        ["coalesce", ["get", "name"], ""],
        " ",
        ["coalesce", ["get", "address_full"], ""],
        " ",
        ["coalesce", ["get", "address"], ""],
        " ",
        ["coalesce", ["get", "zip"], ""],
      ],
    ];
    const searchExpr = term ? [">=", ["index-of", term, haystack], 0] : null;

    // Date filter: pins where inspection_date_recent < cutoff are hidden.
    // Null dates (score=null/zero) are excluded when any cutoff is active.
    const dateExpr = mapCutoffDate
      ? [">=", ["coalesce", ["get", "date"], "0000-00-00"], mapCutoffDate]
      : null;

    const selectedPairs = [];
    for (const [key, spec] of Object.entries(CATEGORY_SPECS)) {
      if (key === "unknown") continue;
      const state = catToggles[key];
      if (!state || !state.enabled) continue;
      for (const p of spec.subs) {
        const code = `${p.ft}:${p.st}`;
        if (state.subs?.[code]) selectedPairs.push(code);
      }
    }
    const unknownOn = !!(catToggles.unknown && catToggles.unknown.enabled);
    const pairToken = [
      "concat",
      ["to-string", ["get", "facility_type"]],
      ":",
      ["to-string", ["get", "subtype"]],
    ];
    const pairExpr = ["in", pairToken, ["literal", selectedPairs]];
    const unknownExpr = ["==", ["get", "cat"], "unknown"];
    const catExpr =
      selectedPairs.length > 0
        ? unknownOn
          ? ["any", pairExpr, unknownExpr]
          : pairExpr
        : unknownOn
        ? unknownExpr
        : ["boolean", false];

    const hidden = ["==", ["get", "score"], "__none__"];
    for (const key of DRAW_ORDER) {
      const id = `points-${key}`;
      let visible = true;
      if ((key === "zero" || key === "null") && !showMissing) visible = false;
      if (key === "red" && !showRedPins) visible = false;
      if (key === "yellow" && !showYellowPins) visible = false;
      if (key === "green" && !showGreenPins) visible = false;

      const conditions = [exprs[key], catExpr];
      if (searchExpr) conditions.push(searchExpr);
      if (dateExpr) conditions.push(dateExpr);
      const f = ["all", ...conditions];

      map.setFilter(id, visible ? f : hidden);
      if (key === "green") map.setPaintProperty(id, "circle-color", PIN_COLORS.green);
    }
  }

  // Table row hover: show hover popup on map
  const onTableRowHover = React.useCallback((establishmentId, rowData) => {
    const map = mapRef.current;
    if (!map) return;
    const feature = featureByEidRef.current[establishmentId];
    if (!feature) return;

    // Clear any previous table-driven hover popup
    if (tableHoverPopupRef.current) {
      tableHoverPopupRef.current.remove();
      tableHoverPopupRef.current = null;
    }

    const p = feature.properties;
    const scoreText = p.score === 0 || p.score == null ? "N/A" : p.score;
    const addr = p.address_full || p.address || "";
    const html = `<div class="popup-content" style="font-size:14px;max-width:220px">
      <strong>${p.name}</strong><br/>
      <small>${addr}</small><br/>
      Score: ${scoreText}${p.grade ? ` (${p.grade})` : ""}
    </div>`;

    tableHoverPopupRef.current = new maplibregl.Popup({
      anchor: "bottom",
      offset: [0, -14],
      closeButton: false,
      closeOnMove: false,
      closeOnClick: false,
    })
      .setLngLat(feature.geometry.coordinates)
      .setHTML(html)
      .addTo(map);

    // Pan map to show the pin (softly)
    const bounds = map.getBounds();
    const [lon, lat] = feature.geometry.coordinates;
    if (!bounds.contains([lon, lat])) {
      map.easeTo({ center: [lon, lat], duration: 400 });
    }
  }, []);

  const onTableRowHoverEnd = React.useCallback(() => {
    if (tableHoverPopupRef.current) {
      tableHoverPopupRef.current.remove();
      tableHoverPopupRef.current = null;
    }
  }, []);

  const onTableRowClick = React.useCallback((row) => {
    // Clear table hover popup
    if (tableHoverPopupRef.current) {
      tableHoverPopupRef.current.remove();
      tableHoverPopupRef.current = null;
    }
    // Find the feature and show a pinned popup on the map
    const map = mapRef.current;
    const feature = featureByEidRef.current[row.establishment_id];
    if (map && feature) {
      // Clear any existing pinned popup
      if (pinnedPopupRef.current) {
        pinnedPopupRef.current.remove();
        pinnedPopupRef.current = null;
      }
      const p = feature.properties;
      const scoreText = p.score === 0 || p.score == null ? "N/A" : p.score;
      const addr = p.address_full || p.address || "";
      const html = `<div class="popup-content" style="font-size:14px;max-width:220px">
        <strong>${p.name}</strong><br/>
        <small>${addr}</small><br/>
        Score: ${scoreText}${p.grade ? ` (${p.grade})` : ""}
      </div>`;
      pinnedPopupRef.current = new maplibregl.Popup({
        anchor: "bottom",
        offset: [0, -14],
        closeButton: false,
        closeOnMove: false,
        closeOnClick: false,
      })
        .setLngLat(feature.geometry.coordinates)
        .setHTML(html)
        .addTo(map);
      // Pan to pin
      map.easeTo({ center: feature.geometry.coordinates, duration: 400 });
    }
    // Load the info drawer
    beginDrawerLoad(row.establishment_id, row);
  }, [beginDrawerLoad]);

  return (
    <>
      <header className="app-header">
        <div className="header-inner">

          {/* Left slot: search (map) or back-to-map link (learn) */}
          <div className="header-search">
            {page === "map" ? (
              <div className="search-wrap">
                <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
                  <path
                    d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
                    fill="currentColor"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search map"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            ) : (
              <button
                className="header-nav-btn"
                onClick={() => setPage("map")}
                style={{ gap: 5 }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 12H5M12 5l-7 7 7 7"/>
                </svg>
                <span className="nav-btn-label">Map</span>
              </button>
            )}
          </div>

          {/* Centre: brand — clicking returns to map */}
          <div
            className="brand"
            style={{ cursor: "pointer" }}
            onClick={() => setPage("map")}
            title="Louisville Food Safe — back to map"
          >
            <span className="brand-louisville">LOUISVILLE</span>
            <span className="brand-food">FOOD</span>
            <span className="brand-safe">SAFE</span>
          </div>

          {/* Right slot: Learn + Feedback + Log in / Account */}
          <div className="header-actions">
            <button
              className={`header-nav-btn${page === "learn" ? " active" : ""}`}
              onClick={() => setPage("learn")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              <span className="nav-btn-label learn-label">Learn</span>
            </button>
            <button
              className="header-nav-btn"
              onClick={() => setFeedbackOpen(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="nav-btn-label">Feedback</span>
            </button>
            {user ? (
              <button
                className={`header-nav-btn${page === "account" ? " active" : ""}`}
                onClick={() => setPage("account")}
                title={user.email}
              >
                <span style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: "rgba(52,168,83,0.30)",
                  border: "1.5px solid rgba(52,168,83,0.55)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: ".65rem", fontWeight: 800, flexShrink: 0,
                }}>
                  {(user.email || "?")[0].toUpperCase()}
                </span>
                <span className="nav-btn-label">Account</span>
              </button>
            ) : (
              <button
                className="header-nav-btn header-nav-btn--login"
                onClick={() => setLoginOpen(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <span className="nav-btn-label">Log in</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Learn page overlay (rendered above the map) */}
      {page === "learn" && (
        <LearnPage
          loginOpen={loginOpen}
          onCloseLogin={() => setLoginOpen(false)}
          supabase={supabase}
          mapCutoffDate={mapCutoffDate}
          onOpenEstablishment={(eid) => {
            setPage("map");
            const f = featureByEidRef.current[eid];
            if (f) beginDrawerLoad(eid, f.properties);
          }}
        />
      )}

      {/* Login modal on map page (learn page renders its own copy) */}
      {page === "map" && loginOpen && (
        <LoginModal onClose={() => setLoginOpen(false)} />
      )}

      {/* Account page overlay */}
      {page === "account" && user && (
        <AccountPage
          onOpenEstablishment={(eid) => {
            setPage("map");
            const f = featureByEidRef.current[eid];
            if (f) beginDrawerLoad(eid, f.properties);
          }}
        />
      )}

      {/* Feedback modal — available on all pages */}
      {feedbackOpen && (
        <FeedbackModal
          supabase={supabase}
          onClose={() => setFeedbackOpen(false)}
        />
      )}

      {/* Map and all map UI (hidden via CSS when on learn page) */}
      <div
        ref={mapContainerRef}
        className="map-container"
        style={page !== "map" ? { visibility: "hidden", pointerEvents: "none" } : undefined}
      />

      {page === "map" && (
        <>
          <FilterSearch
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            showRedPins={showRedPins}
            setShowRedPins={setShowRedPins}
            showYellowPins={showYellowPins}
            setShowYellowPins={setShowYellowPins}
            showGreenPins={showGreenPins}
            setShowGreenPins={setShowGreenPins}
            showMissing={showMissing}
            setShowMissing={setShowMissing}
            filtersOpen={filtersOpen}
            setFiltersOpen={setFiltersOpen}
            catToggles={catToggles}
            setCatToggles={setCatToggles}
            CATEGORY_SPECS={CATEGORY_SPECS}
            CAT_COLORS={CAT_COLORS}
            buildInitialCatToggles={buildInitialCatToggles}
            onAdjustClick={() => {}}
            adjustContent={
              <ScoreThresholdInline
                pins={pins}
                setPins={setPins}
                preset={preset}
                applyPreset={applyPreset}
              />
            }
            dateFilterKey={dateFilterKey}
            setDateFilterKey={setDateFilterKey}
            dateFilterOpts={DATE_FILTER_OPTS}
          />

          <InfoDrawer
            selected={selected}
            drawerLoading={drawerLoading}
            history={history}
            facDetails={facDetails}
            pins={pins}
            zIndex={frontPanel === "drawer" ? 3100 : 2900}
            onBringToFront={() => setFrontPanel("drawer")}
            onSwitchTo={(switchEid) => {
              const f = featureByEidRef.current[switchEid];
              if (f) beginDrawerLoad(switchEid, f.properties);
            }}
            onClose={() => {
              setSelected(null);
              setHistory(null);
              setHistoryFor(null);
              setFacDetails(null);
              setFacDetailsFor(null);
              setDrawerLoading(false);
              loadSeqRef.current++;
            }}
          />

          {!tableOpen && (
            <button
              className="table-toggle-btn"
              onClick={() => { setTableOpen(true); setWhatsNewOpen(false); }}
              aria-label="Open table view"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M3 15h18M9 3v18"/>
              </svg>
              Table View
            </button>
          )}

          <WhatsNew
            supabase={supabase}
            open={whatsNewOpen}
            onClose={() => setWhatsNewOpen(false)}
            onOpen={() => { setWhatsNewOpen(true); setTableOpen(false); }}
            onOpenEstablishment={(eid) => {
              const f = featureByEidRef.current[eid];
              if (f) beginDrawerLoad(eid, f.properties);
            }}
          />

          <TableView
            supabase={supabase}
            onClose={() => setTableOpen(false)}
            onRowClick={onTableRowClick}
            onRowHover={onTableRowHover}
            onRowHoverEnd={onTableRowHoverEnd}
            savedH={tableH}
            savedW={tableW}
            onResize={(h, w) => { setTableH(h); setTableW(w); }}
            pins={pins}
            hidden={!tableOpen}
            zIndex={frontPanel === "table" ? 3100 : 2900}
            onBringToFront={() => setFrontPanel("table")}
          />
        </>
      )}
    </>
  );
}