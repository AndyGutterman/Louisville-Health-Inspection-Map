import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { createClient } from "@supabase/supabase-js";
import InfoDrawer from "./InfoDrawer.jsx";
import FilterSearch from "./FilterSearch.jsx";
import { ScoreThresholdInline } from "./ScoreThreshold.jsx";
import { PIN_COLORS, CAT_COLORS } from "./Colors.jsx";
import * as AccessibleIcon from "@radix-ui/react-accessible-icon";
import { ChevronLeftIcon, ChevronRightIcon } from "@radix-ui/react-icons";

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

function buildCoordIndex(features) {
  const m = new globalThis.Map();
  for (const f of features) {
    const k = coordKey(f.geometry.coordinates);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(f);
  }
  return m;
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

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const hoverPopupRef = useRef(null);
  const pinnedPopupRef = useRef(null);
  const pinnedReactRootRef = useRef(null);
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
  const [bandsOpen, setBandsOpen] = useState(false);

  const inEdgeRef = useRef(false);

  const isHoverCapableRef = useRef(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(hover: hover)").matches
      : false,
  );

  const suppressDocCloseRef = useRef(false);

  React.useEffect(() => {
    (async () => {
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
      const featureList = Object.values(latestMap);
      coordIndexRef.current = buildCoordIndex(featureList);
      setGeoData({
        type: "FeatureCollection",
        features: featureList,
      });
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

      const nearestOf = (point, feats) => {
        let best = null, bestd = Infinity, bestz = -Infinity;
        const EPS = 0.9; // ~1px in screen distance
        for (const f of feats) {
          const p = map.project(f.geometry.coordinates);
          const d = Math.hypot(p.x - point.x, p.y - point.y);
          const z = styleZ(f.layer?.id);
          if (d + 1e-6 < bestd || (Math.abs(d - bestd) <= EPS && z > bestz)) {
            best = f; bestd = d; bestz = z;
          }
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


      


      const featuresAtPixel = (point) =>
      map.queryRenderedFeatures(
        [
          [point.x, point.y],
          [point.x, point.y],
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
      let best = hits[0], bestd = Infinity;
      for (const h of hits) {
        const p = map.project(h.geometry.coordinates);
        const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
        if (d < bestd) { bestd = d; best = h; }
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
        return `<div class="popup-content" style="font-size:14px;max-width:220px">
     <strong>${p.name}</strong><br/>
    <small>${addr}</small><br/>
          <small>Inspected: ${formatDateSafe(p.date)}</small><br/>
          Score: ${scoreText}${p.grade ? ` (${p.grade})` : ""}
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

      const beginDrawerLoad = async (eid, p) => {
        const seq = ++loadSeqRef.current;
        setDrawerLoading(true);
        setHistory(null);
        setHistoryFor(null);
        setFacDetails(null);
        setFacDetailsFor(null);

        const { data: insp, error } = await supabase
          .from("inspections")
          .select(
            "inspection_id, inspection_date, score, grade, ins_type_desc, establishment_id",
          )
          .eq("establishment_id", eid)
          .order("inspection_date", { ascending: false })
          .order("inspection_id", { ascending: false });

        if (error) {
          console.error("history fetch error", error);
          if (seq !== loadSeqRef.current) return;
          setDrawerLoading(false);
          return;
        }

        const { data: viols, error: vErr } = await supabase
          .from("inspection_violations")
          .select(
            "violation_oid, inspection_id, inspection_date, violation_desc, insp_viol_comments, critical_yn, establishment_id",
          )
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

        const selectedData = headerRow
          ? {
              establishment_id: eid,
              name: p.name,
              address: p.address,
              inspectionDate: formatDateSafe(headerRow.inspection_date),
              score: headerRow.score ?? null,
              grade: headerRow.grade ?? null,
              _displayedInspectionId: headerRow.inspection_id,
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
              meta: null,
            };

        let details = null;
        let fullAddress = null;
        {
          const { data: fac, error: facErr } = await supabase
            .from("facilities")
            .select(
              "opening_date, facility_type, subtype, address, city, state, zip, permit_number",
            )
            .eq("establishment_id", eid)
            .maybeSingle();

          if (facErr) console.error("facilities fetch error", facErr);

          let typeLabel = fac?.facility_type ?? null;
          let subtypeLabel = fac?.subtype ?? null;

          if (fac?.facility_type != null && fac?.subtype != null) {
            const { data: cat, error: catErr } = await supabase
              .from("facility_categories")
              .select("facility_type_description, subtype_description")
              .eq("facility_type", fac.facility_type)
              .eq("subtype", fac.subtype)
              .maybeSingle();
            if (catErr) console.error("facility_categories fetch error", catErr);
            typeLabel = cat?.facility_type_description ?? typeLabel;
            subtypeLabel = cat?.subtype_description ?? subtypeLabel;
          }

          details = {
            opening_date: fac?.opening_date ? formatDateSafe(fac.opening_date) : null,
            facility_type: typeLabel,
            subtype: subtypeLabel,
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
  ]);

  React.useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.resize();
    const t = setTimeout(() => m.resize(), 320);
    return () => clearTimeout(t);
  }, [bandsOpen]);

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
      ],
    ];
    const searchExpr = term ? [">=", ["index-of", term, haystack], 0] : null;

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

      const base = ["all", exprs[key], catExpr];
      const f = searchExpr ? ["all", exprs[key], catExpr, searchExpr] : base;

      map.setFilter(id, visible ? f : hidden);
      if (key === "green") map.setPaintProperty(id, "circle-color", PIN_COLORS.green);
    }
  }

  return (
    <>
      <header className="app-header">
        <div className="header-inner">
          <div className="header-search">
            <div className="search-wrap">
              <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
                <path
                  d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
                  fill="currentColor"
                />
              </svg>
              <input
                type="text"
                placeholder="Search by name"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="brand">
            <span className="brand-louisville">LOUISVILLE</span>
            <span className="brand-food">FOOD</span>
            <span className="brand-safe">SAFE</span>
          </div>

          <div aria-hidden />
        </div>
      </header>

      <div ref={mapContainerRef} className="map-container" />

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
      />

      <InfoDrawer
        selected={selected}
        drawerLoading={drawerLoading}
        history={history}
        facDetails={facDetails}
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
    </>
  );
}
