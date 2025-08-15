import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Map.css";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const COLORS = {
  red: "#ea4335",
  yellow: "#fbbc05",
  green: "#34a853",
  zero: "#000000",
  null: "#657786",
};

const DRAW_ORDER = ["green", "yellow", "zero", "null", "red"];
const MIN_ZOOM = 11;

const SCORE_MIN = 1;
const SCORE_MAX = 99;
const RED_CAP = 98;
const YEL_CAP = 99;

const EDGE_ZONE = 24;
const SPURT_PX = 60;

function clampPins([r, y]) {
  r = Math.max(SCORE_MIN, Math.min(RED_CAP, Math.round(r)));
  y = Math.max(r + 1, Math.min(YEL_CAP, Math.round(y)));
  return [r, y];
}

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

function CurrentInspectionCard({ data, details }) {
  if (!data) return null;
  const { name, address, inspectionDate, score, grade, meta, metaTitle } = data;
  const gradeDisplay =
    grade && String(grade).trim().length > 0 ? String(grade).trim() : "—";
  const scoreNum = typeof score === "number" ? score : null;
  const badgeClass =
    scoreNum != null && scoreNum >= 95 ? "ok" : scoreNum != null && scoreNum >= 85 ? "warn" : "bad";
  const scoreText = scoreNum === 0 || scoreNum == null ? "N/A" : scoreNum;

  const items = details
    ? [
      { label: "Opening date", value: details.opening_date ?? "—" },
      { label: "Facility type", value: details.facility_type ?? "—" },
      { label: "Subtype", value: details.subtype ?? "—" },
    ]
    : [];

  const hasDetails = items.some((i) => i.value && i.value !== "—");
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className={`inspect-card ${open ? "open" : ""}`}
      onClick={() => setOpen((v) => !v)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") setOpen((v) => !v);
      }}
    >
      {meta && (
        <div className="inspect-meta" title={metaTitle || ""}>
          {meta}
        </div>
      )}

      <div className="inspect-card_header">
        <div className="inspect-card_title">{name}</div>
        <div className="inspect-card_sub">{address}</div>
      </div>

      <div className="inspect-card_stats">
        <div className="inspect-stat">
          <div className={`inspect-badge ${badgeClass}`}>{scoreText}</div>
          <div className="inspect-stat_label">Score</div>
        </div>

        <div className="inspect-stat">
          <div className="inspect-date">{inspectionDate}</div>
          <div className="inspect-stat_label">Date</div>
        </div>

        <div className="inspect-stat">
          <div className={`inspect-pill ${gradeDisplay === "—" ? "muted" : ""}`}>
            {gradeDisplay}
          </div>
          <div className="inspect-stat_label">Grade</div>
        </div>
      </div>

      {hasDetails && (
        <>
          <div className="inspect-more-inline">
            <span>More info</span>
            <svg viewBox="0 0 24 24" width="16" height="16" className="chev" aria-hidden="true">
              <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>

          {open && (
            <div className="inspect-details">
              <div className="inspect-details-grid">
                {items.map((it) => (
                  <div className="detail-item" key={it.label}>
                    <div className="detail-label">{it.label}</div>
                    <div className="detail-value">{it.value}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ViolationRow({ v }) {
  const yn = String(v.critical_yn || "").trim().toLowerCase();
  const isCrit = yn === "y" || yn === "yes" || yn === "true" || yn === "t" || yn === "1";
  const title = v.violation_desc || "Violation";
  const body = (v.insp_viol_comments || "").trim();
  const [open, setOpen] = React.useState(false);
  const maxLen = 240;
  const hasMore = body.length > maxLen;
  const shown = open || !hasMore ? body : body.slice(0, maxLen) + "…";

  return (
    <li className={`viol-card ${isCrit ? "crit" : ""}`}>
      <div className="viol-rail" />
      <div className="viol-body">
        <div className="viol-header">
          {isCrit && <span className="viol-chip crit">Critical</span>}
          <span className="viol-title">{title}</span>
        </div>

        {shown && <div className="viol-text">{shown}</div>}

        {hasMore && (
          <button
            className="viol-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((x) => !x);
            }}
          >
            {open ? "Show less" : "Read more"}
          </button>
        )}
      </div>
    </li>
  );
}

function PastInspection({ row }) {
  const date = formatDateSafe(row.inspection_date);
  const gradeDisplay =
    row.grade && String(row.grade).trim().length > 0 ? String(row.grade).trim() : "—";
  const scoreNum = typeof row.score === "number" ? row.score : null;
  const scoreText = scoreNum === 0 || scoreNum == null ? "N/A" : scoreNum;
  const badgeClass =
    scoreNum != null && scoreNum >= 95 ? "ok" : scoreNum != null && scoreNum >= 85 ? "warn" : "bad";

  const rawViols = Array.isArray(row.violations) ? row.violations : [];
  const isCrit = (v) => {
    const yn = String(v.critical_yn || "").trim().toLowerCase();
    return yn === "y" || yn === "yes" || yn === "true" || yn === "t" || yn === "1";
  };
  const viols = [...rawViols].sort((a, b) => (isCrit(b) ? 1 : 0) - (isCrit(a) ? 1 : 0));

  const [open, setOpen] = React.useState(false);
  const showToggle = viols.length > 0;
  const list = viols;
  const anyCrit = viols.some(isCrit);

  const listRef = useRef(null);
  const [maxH, setMaxH] = useState(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    setMaxH(open ? el.scrollHeight : 0);
  }, [open, viols.length]);

  return (
    <div className="hist-item">
      <div className="hist-head">
        <div className="hist-left">
          <div className={`hist-score ${badgeClass}`}>{scoreText}</div>
          <div className="hist-meta">
            <div className="hist-date">{date}</div>
            <div className="hist-type">{row.ins_type_desc || "Inspection"}</div>
          </div>
        </div>

        {viols.length > 0 && (
          <button
            type="button"
            className={`viol-count ${anyCrit ? "crit" : ""} ${open ? "open" : ""} ${showToggle ? "clickable" : ""}`}
            onClick={showToggle ? () => setOpen((x) => !x) : undefined}
            aria-expanded={open}
            title={showToggle ? (open ? "Collapse" : `Show all ${viols.length}`) : `${viols.length} violations`}
          >
            {viols.length} {viols.length === 1 ? "violation" : "violations"}
            {showToggle && <span className="chev" aria-hidden="true">▾</span>}
          </button>
        )}

        <div className={`hist-grade ${gradeDisplay === "—" ? "muted" : ""}`}>{gradeDisplay}</div>
      </div>

      {viols.length > 0 && (
        <div className="viol-group">
          <div className="viol-group-header" />
          <div className={`viol-collapse ${open ? "open" : ""}`} style={{ maxHeight: maxH }}>
            <ul ref={listRef} className="viol-list">
              {list.map((v) => (
                <ViolationRow
                  key={v.violation_oid ?? `${row.inspection_id}-${v.violation_desc}`}
                  v={v}
                />
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function History({ rows }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="hist-wrap">
      <div className="hist-title">Inspection History</div>
      <div className="hist-list">
        {rows.map((r) => (
          <PastInspection
            key={r.inspection_id ?? `${r.establishment_id}-${r.inspection_date}`}
            row={r}
          />
        ))}
      </div>
    </div>
  );
}

export default function Map() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const hoverPopupRef = useRef(null);
  const pinnedPopupRef = useRef(null);
  const lastHoverId = useRef(null);
  const pinnedFeatureRef = useRef(null);
  const docCloseHandlerRef = useRef(null);
  const isDraggingRef = useRef(false);

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

  const [pins, setPins] = useState(clampPins([85, 94]));
  const pinsRef = useRef(pins);
  useEffect(() => {
    pinsRef.current = pins;
  }, [pins]);

  const [showMissing, setShowMissing] = useState(false);
  const [showRedPins, setShowRedPins] = useState(true);
  const [showYellowPins, setShowYellowPins] = useState(true);
  const [showGreenPins, setShowGreenPins] = useState(true);

  const [bandsOpen, setBandsOpen] = useState(false);

  const miniRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef({ which: null, el: null, mode: "track" });

  const inEdgeRef = useRef(false);

  const isHoverCapableRef = useRef(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(hover: hover)").matches
      : false
  );

  const suppressDocCloseRef = useRef(false);

  useEffect(() => {
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
            "establishment_id,premise_name,address,lon,lat,inspection_date_recent,score_recent,grade_recent"
          )
          .range(offset, to);
        if (error) {
          console.error(error);
          return;
        }
        allRows = allRows.concat(data);
      }
      const features = allRows
        .filter((r) => typeof r.lon === "number" && typeof r.lat === "number")
        .map((r, i) => ({
          type: "Feature",
          id: i,
          geometry: { type: "Point", coordinates: [r.lon, r.lat] },
          properties: {
            establishment_id: r.establishment_id,
            name: r.premise_name,
            address: r.address,
            date: r.inspection_date_recent,
            score: r.score_recent,
            grade: r.grade_recent,
          },
        }));
      const latestMap = features.reduce((acc, feat) => {
        const eid = feat.properties.establishment_id;
        const prev = acc[eid];
        if (!prev || (feat.properties.date && feat.properties.date > prev.properties.date))
          acc[eid] = feat;
        return acc;
      }, {});
      setGeoData({ type: "FeatureCollection", features: Object.values(latestMap) });
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
    else m.once("idle", () => {
      if (isMapReady()) applyFilter(m);
    });
  }

  useEffect(() => {
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
          paint: { ...basePaint, "circle-color": key === "green" ? COLORS.green : COLORS[key] },
          filter: exprs[key],
        });
      }

      const layerIds = DRAW_ORDER.map((k) => `points-${k}`);

      const colorForScore = (score) => {
        const [rMax, yMax] = pinsRef.current;
        if (score == null) return COLORS.null;
        if (score === 0) return COLORS.zero;
        if (score <= rMax) return COLORS.red;
        if (score <= yMax) return COLORS.yellow;
        return COLORS.green;
      };

      const renderHTML = (p) => {
        const scoreText = p.score === 0 || p.score == null ? "N/A" : p.score;
        return `<div class="popup-content" style="font-size:14px;max-width:220px">
          <strong>${p.name}</strong><br/>
          <small>${p.address}</small><br/>
          <small>Inspected: ${formatDateSafe(p.date)}</small><br/>
          Score: ${scoreText}${p.grade ? ` (${p.grade})` : ""}
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
          .select("inspection_id, inspection_date, score, grade, ins_type_desc, establishment_id")
          .eq("establishment_id", eid)
          .order("inspection_date", { ascending: false });

        if (error) {
          console.error("history fetch error", error);
          if (seq !== loadSeqRef.current) return;
          setDrawerLoading(false);
          return;
        }

        const { data: viols, error: vErr } = await supabase
          .from("inspection_violations")
          .select(
            "violation_oid, inspection_id, inspection_date, violation_desc, insp_viol_comments, critical_yn, establishment_id"
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

        const latestNonZero = mergedDesc.find((r) => (r.score ?? 0) > 0);
        const headerRow = latestNonZero || mergedDesc[0] || null;

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
        {
          const { data: fac, error: facErr } = await supabase
            .from("facilities")
            .select("opening_date, facility_type, subtype")
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
          };
        }

        setSelected(selectedData);
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

      const showHoverPopup = (feature) => {
        const html = renderHTML(feature.properties);
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
        if (!e.features.length) return;
        const f = e.features[0];
        if (f.id === lastHoverId.current) return;
        lastHoverId.current = f.id;
        showHoverPopup(f);
      };

      const onLeave = () => {
        lastHoverId.current = null;
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = null;
      };

      const onClick = (e) => {
        const f = e.features[0];
        hoverPopupRef.current?.remove();
        hoverPopupRef.current = null;
        lastHoverId.current = null;
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
        if (document.querySelector(".info-drawer")?.contains(ev.target)) return;
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
      pinnedPopupRef.current?.remove();
      pinnedPopupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [geoData]);

  useEffect(() => {
    if (mapRef.current) applyFilterWhenReady();
  }, [pins, showMissing, searchTerm, showRedPins, showYellowPins, showGreenPins]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    m.resize();
    const t = setTimeout(() => m.resize(), 320);
    return () => clearTimeout(t);
  }, [bandsOpen]);

  const [miniActive, setMiniActive] = useState(null);
  const [activeHandle, setActiveHandle] = useState(null);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    const dragging = miniActive != null || activeHandle != null;
    const stopWheel = (e) => e.preventDefault();
    if (dragging) {
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
  }, [miniActive, activeHandle]);

  const MINI_GAMMA = 1.8,
    TRACK_GAMMA = 2;
  const warpMini = (t) => Math.pow(t, MINI_GAMMA);
  const unwarpMini = (t) => Math.pow(t, 1 / MINI_GAMMA);
  const warpTrack = (t) => Math.pow(t, TRACK_GAMMA);
  const unwarpTrack = (t) => Math.pow(t, 1 / TRACK_GAMMA);

  const valueToMiniPct = (v) => warpMini(v / SCORE_MAX) * 100;
  const pctToValueMini = (pct) =>
    Math.max(SCORE_MIN, Math.min(YEL_CAP, Math.round(unwarpMini(pct / 100) * SCORE_MAX)));
  const pxToValueMini = (x, el) => {
    const r = el.getBoundingClientRect();
    const ratio = (x - r.left) / r.width;
    return pctToValueMini(Math.max(0, Math.min(1, ratio)) * 100);
  };

  const valueToTrackPct = (v) => warpTrack(v / SCORE_MAX) * 100;
  const pctToValueTrack = (pct) =>
    Math.max(SCORE_MIN, Math.min(YEL_CAP, Math.round(unwarpTrack(pct / 100) * SCORE_MAX)));
  const pxToValueTrack = (x, el) => {
    const r = el.getBoundingClientRect();
    const ratio = (x - r.left) / r.width;
    return pctToValueTrack(Math.max(0, Math.min(1, ratio)) * 100);
  };

  const [rMax, yMax] = pins;
  const pRMini = valueToMiniPct(rMax),
    pYMini = valueToMiniPct(yMax);
  const wRedMini = warpMini(rMax / SCORE_MAX) * 100,
    wYellowMini = Math.max(0, (warpMini(yMax / SCORE_MAX) - warpMini(rMax / SCORE_MAX)) * 100),
    wGreenMini = Math.max(0, (1 - warpMini(yMax / SCORE_MAX)) * 100);
  const pRTrack = valueToTrackPct(rMax),
    pYTrack = valueToTrackPct(yMax);
  const wRed = warpTrack(rMax / SCORE_MAX) * 100,
    wYellow = Math.max(0, (warpTrack(yMax / SCORE_MAX) - warpTrack(rMax / SCORE_MAX)) * 100),
    wGreen = Math.max(0, (1 - warpTrack(yMax / SCORE_MAX)) * 100);

  function applyFilter(map) {
    const exprs = bandExprs(pins);
    const term = searchTerm.trim().toLowerCase();
    const searchExpr = term ? [">=", ["index-of", term, ["downcase", ["get", "name"]]], 0] : null;
    const hidden = ["==", ["get", "score"], "__none__"];
    for (const key of DRAW_ORDER) {
      const id = `points-${key}`;
      let visible = true;
      if ((key === "zero" || key === "null") && !showMissing) visible = false;
      if (key === "red" && !showRedPins) visible = false;
      if (key === "yellow" && !showYellowPins) visible = false;
      if (key === "green") visible = visible && showGreenPins;
      const f = searchExpr ? ["all", exprs[key], searchExpr] : exprs[key];
      map.setFilter(id, visible ? f : hidden);
      if (key === "green") {
        map.setPaintProperty(id, "circle-color", COLORS.green);
      }
    }
  }

  function dragStart(which, el, clientX, mode = "track") {
    dragRef.current = { which, el, mode };
    if (typeof clientX === "number") dragMove(clientX);
    const move = (ev) => dragMove(ev.clientX);
    const up = () => {
      dragRef.current = { which: null, el: null, mode: "track" };
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setActiveHandle(null);
      setMiniActive(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  }
  function dragMove(clientX) {
    const { which, el, mode } = dragRef.current;
    if (!el || which == null) return;
    const v = mode === "mini" ? pxToValueMini(clientX, el) : pxToValueTrack(clientX, el);
    setPins(([r, y]) => clampPins(which === 0 ? [Math.min(v, y - 1), y] : [r, Math.max(r + 1, v)]));
  }

  const isInDeadzone = (x, y) => {
    const M = 8,
      els = [document.querySelector(".fab-scores"), document.querySelector(".control-card")].filter(
        Boolean
      );
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (x >= r.left - M && x <= r.right + M && y >= r.top - M && y <= r.bottom + M) return true;
    }
    return false;
  };
  const spurtDisabled = () =>
    !mapRef.current || bandsOpen || miniActive !== null || activeHandle !== null;

  useEffect(() => {
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
        mapRef.current.panBy([dx * SPURT_PX, dy * SPURT_PX], { duration: 240 });
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
  }, [bandsOpen, miniActive, activeHandle]);

  useEffect(() => {
    if (!bandsOpen) return;
    const closeOnTap = (ev) => {
      if (isDraggingRef.current) return;
      const sheet = document.querySelector(".bands-sheet");
      if (sheet && !sheet.contains(ev.target)) {
        setBandsOpen(false);
      }
    };
    document.addEventListener("click", closeOnTap, true);
    return () => document.removeEventListener("click", closeOnTap, true);
  }, [bandsOpen]);

  return (
    <>
      <div ref={mapContainerRef} className="map-container" />

      <div className="controls">
        <div className="control-card">
          <div className="search-bar">
            <svg viewBox="0 0 24 24" className="icon" aria-hidden="true">
              <path
                d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79L20 21.5 21.5 20 15.5 14zM9.5 14A4.5 4.5 0 1 1 14 9.5 4.505 4.505 0 0 1 9.5 14z"
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

          <div className="rgb-toggles">
            <div className="rgb-row">
              <span className="label">Show Red</span>
              <label className="switch sm red">
                <input
                  type="checkbox"
                  checked={showRedPins}
                  onChange={(e) => setShowRedPins(e.target.checked)}
                />
                <span />
              </label>
            </div>
            <div className="rgb-row">
              <span className="label">Show Yellow</span>
              <label className="switch sm yellow">
                <input
                  type="checkbox"
                  checked={showYellowPins}
                  onChange={(e) => setShowYellowPins(e.target.checked)}
                />
                <span />
              </label>
            </div>
            <div className="rgb-row">
              <span className="label">Show Green</span>
              <label className="switch sm green">
                <input
                  type="checkbox"
                  checked={showGreenPins}
                  onChange={(e) => setShowGreenPins(e.target.checked)}
                />
                <span />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="fab-scores">
        <div className="fab-row">
          <span>Scores</span>

          <div
            className={`mini-bar ${miniActive != null ? "dragging" : ""}`}
            ref={miniRef}
            onPointerDown={(e) => {
              const el = miniRef.current;
              const rct = el.getBoundingClientRect();
              const ratio = (e.clientX - rct.left) / rct.width;
              const pct = Math.max(0, Math.min(1, ratio)) * 100;
              const unwarpMini = (t) => Math.pow(t, 1 / 1.8);
              const val = Math.round(unwarpMini(pct / 100) * 99);
              const v = Math.max(1, Math.min(99, val));
              const [r, y] = pinsRef.current;
              const which = Math.abs(v - r) <= Math.abs(v - y) ? 0 : 1;
              setMiniActive(which);
              dragStart(which, el, e.clientX, "mini");
            }}
          >
            <div className="mini-seg red" style={{ width: `${warpMini(rMax / SCORE_MAX) * 100}%` }} />
            <div
              className="mini-seg yellow"
              style={{
                width: `${Math.max(
                  0,
                  (warpMini(yMax / SCORE_MAX) - warpMini(rMax / SCORE_MAX)) * 100
                )}%`,
              }}
            />
            <div
              className="mini-seg green"
              style={{ width: `${Math.max(0, (1 - warpMini(yMax / SCORE_MAX)) * 100)}%` }}
            />

            <div
              className="mini-handle"
              style={{ "--pos": `${warpMini(rMax / SCORE_MAX) * 100}%` }}
              onPointerDown={(e) => {
                setMiniActive(0);
                dragStart(0, miniRef.current, e.clientX, "mini");
              }}
            >
              <span>{pins[0]}</span>
            </div>
            <div
              className="mini-handle"
              style={{ "--pos": `${warpMini(yMax / SCORE_MAX) * 100}%` }}
              onPointerDown={(e) => {
                setMiniActive(1);
                dragStart(1, miniRef.current, e.clientX, "mini");
              }}
            >
              <span>{pins[1]}</span>
            </div>
          </div>

          <button className="fab-open" onClick={() => setBandsOpen(true)}>
            Adjust
          </button>
        </div>
      </div>

      <div className={`bands ${bandsOpen ? "open" : ""}`}>
        <div className="bands-backdrop" />
        <div className="bands-sheet">
          <button className="bands-close" aria-label="Close" onClick={() => setBandsOpen(false)}>
            ×
          </button>
          <div className="bands-header">
            <div className="grab" />
            <div className="title">Score bands</div>
          </div>

          <div className="presets">
            <button onClick={() => setPins(clampPins([73, 95]))}>Loose</button>
            <button onClick={() => setPins(clampPins([85, 94]))}>Balanced</button>
            <button onClick={() => setPins(clampPins([90, 96]))}>Strict</button>
          </div>

          <div
            className={`track ${activeHandle != null ? "dragging" : ""}`}
            ref={trackRef}
            onPointerDown={(e) => {
              const el = trackRef.current;
              const rct = el.getBoundingClientRect();
              const ratio = (e.clientX - rct.left) / rct.width;
              const pct = Math.max(0, Math.min(1, ratio)) * 100;
              const unwarpTrack = (t) => Math.pow(t, 1 / 2);
              const val = Math.round(unwarpTrack(pct / 100) * 99);
              const v = Math.max(1, Math.min(99, val));
              const [rr, yy] = pinsRef.current;
              const which = Math.abs(v - rr) <= Math.abs(v - yy) ? 0 : 1;
              setActiveHandle(which);
              dragStart(which, el, e.clientX, "track");
            }}
          >
            <div className="seg red" style={{ width: `${warpTrack(rMax / SCORE_MAX) * 100}%` }} />
            <div
              className="seg yellow"
              style={{
                width: `${Math.max(
                  0,
                  (warpTrack(yMax / SCORE_MAX) - warpTrack(rMax / SCORE_MAX)) * 100
                )}%`,
              }}
            />
            <div className="seg green" style={{ width: `${Math.max(0, (1 - warpTrack(yMax / SCORE_MAX)) * 100)}%` }} />

            <div className="ruler">
              {[25, 50, 75].map((v) => (
                <div key={`M-${v}`} className="major-wrap" style={{ left: `${warpTrack(v / SCORE_MAX) * 100}%` }}>
                  <div className="tick major" />
                  <div className="tick-label">{v}</div>
                </div>
              ))}
            </div>

            <div className={`handle ${activeHandle === 0 ? "active" : ""}`} style={{ "--pos": `${warpTrack(rMax / SCORE_MAX) * 100}%` }}>
              <span className="label">{pins[0]}</span>
            </div>
            <div className={`handle ${activeHandle === 1 ? "active" : ""}`} style={{ "--pos": `${warpTrack(yMax / SCORE_MAX) * 100}%` }}>
              <span className="label">{pins[1]}</span>
            </div>
          </div>

          <div className="legend">
            <div>
              <span className="sw" style={{ background: COLORS.red }} />
              {`1–${pins[0]}`}
            </div>
            <div>
              <span className="sw" style={{ background: COLORS.yellow }} />
              {`${pins[0] + 1}–${pins[1]}`}
            </div>
            <div>
              <span className="sw" style={{ background: "#0f9d58" }} />
              {`${pins[1] + 1}–100`}
            </div>
          </div>

          <div className="toggles">
            <label className="switch">
              <input
                type="checkbox"
                checked={showMissing}
                onChange={(e) => setShowMissing(e.target.checked)}
              />
              <span />
            </label>
            <span className="label">Show limited data</span>
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="info-drawer"
          style={{
            position: "fixed",
            right: 16,
            top: 16,
            bottom: 16,
            width: "min(520px,92vw)",
            background: "rgba(24,24,24,0.96)",
            backdropFilter: "blur(6px)",
            color: "#fff",
            zIndex: 5,
            borderRadius: 12,
            boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          }}
        >
          <button
            className="info-close"
            onClick={() => {
              setSelected(null);
              setHistory(null);
              setHistoryFor(null);
              setFacDetails(null);
              setFacDetailsFor(null);
              setDrawerLoading(false);
              loadSeqRef.current++;
            }}
            aria-label="Close"
          >
            ×
          </button>

          <div className={`drawer-veil ${drawerLoading ? "show" : ""}`} />

          <CurrentInspectionCard
            data={
              selected && {
                name: selected.name,
                address: selected.address,
                inspectionDate: selected.inspectionDate,
                score: selected.score,
                grade: selected.grade,
                meta: selected.meta,
                metaTitle: selected.metaTitle,
              }
            }
            details={facDetails}
          />

          <div className="inspect-card_spacer" />

          {history && <History rows={history} />}
        </div>
      )}
    </>
  );
}
