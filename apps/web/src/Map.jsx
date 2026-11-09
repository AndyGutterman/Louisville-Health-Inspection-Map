// The app shell: the header, the map, and every panel around it. This file decides which
// panels are open and wires them together; the work lives in features/map/:
//   useMapFeatures     loads the pins            useDrawer       the info drawer's data
//   useWatchlist       saved places and areas    useMapLibre     the map, pins and popups
//   useWatchAreaLayer  watch-area circles        AppHeader       the top bar
import React, { useEffect, useMemo, useRef, useState } from "react";
// Stylesheet order matters (later files win ties), so these keep their original order:
// LearnPage.css, then MapLibre's CSS, then Map.css, then each panel's own stylesheet.
import LearnPage, { LoginModal } from "./LearnPage.jsx";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles/Map.css";
import InfoDrawer from "./InfoDrawer.jsx";
import TableView from "./TableView.jsx";
import FilterSearch from "./FilterSearch.jsx";
import { ScoreThresholdInline } from "./ScoreThreshold.jsx";
import FeedbackModal from "./FeedbackModal.jsx";
import AccountPage, { ACCOUNT_PANEL_W } from "./AccountPage.jsx";
import WhatsNew from "./WhatsNew.jsx";
import { useAuth } from "./AuthContext.jsx";
import { supabase } from "./lib/supabase.js";
import { useMediaQuery } from "./hooks/useMediaQuery.js";
import { DATE_FILTER_OPTS } from "./lib/constants.js";
import { PRESETS } from "./lib/scoring.js";
import { CATEGORY_SPECS, buildInitialCatToggles } from "./lib/categories.js";
import { DEFAULT_REGION, enabledRegions, regionById } from "./lib/regions.js";
import { BULLITT, isBullittId } from "./lib/bullitt.js";
import CountyPicker from "./features/map/CountyPicker.jsx";
import AppHeader from "./features/map/AppHeader.jsx";
import { useMapFeatures } from "./features/map/useMapFeatures.js";
import { useDrawer } from "./features/map/useDrawer.js";
import { useWatchlist } from "./features/map/useWatchlist.js";
import { useMapLibre } from "./features/map/useMapLibre.js";
import { useWatchAreaLayer } from "./features/map/useWatchAreaLayer.js";

// YYYY-MM-DD `days` ago, or null for "All time".
function cutoffFor(dateFilterKey) {
  const days = DATE_FILTER_OPTS.find((o) => o.key === dateFilterKey)?.days;
  if (!days) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Map({ onMapReady }) {
  const { user } = useAuth();
  const isMobile = useMediaQuery("(max-width: 600px)");
  const containerRef = useRef(null);

  // ── Filter panel ─────────────────────────────────────────────────────────────
  // One county's pins at a time: their data differ (lib/regions.js), so filters that a
  // county's data can't support (categories, dates) are left out for it.
  const [county, setCounty] = useState(DEFAULT_REGION);
  const region = regionById(county);
  const [searchTerm, setSearchTerm] = useState("");
  const [pins, setPins] = useState(PRESETS.balanced); // red/yellow score cut-offs
  const [preset, setPreset] = useState("balanced");
  const [showRedPins, setShowRedPins] = useState(true);
  const [showYellowPins, setShowYellowPins] = useState(true);
  const [showGreenPins, setShowGreenPins] = useState(true);
  const [showMissing, setShowMissing] = useState(false); // unscored pins
  const [catToggles, setCatToggles] = useState(buildInitialCatToggles());
  const [dateFilterKey, setDateFilterKey] = useState("1yr");
  const cutoffDate = useMemo(() => cutoffFor(dateFilterKey), [dateFilterKey]);
  const filters = useMemo(
    () => ({
      pins,
      show: {
        red: showRedPins,
        yellow: showYellowPins,
        green: showGreenPins,
        missing: showMissing,
      },
      catToggles: region.has.categories ? catToggles : null,
      searchTerm,
      cutoffDate: region.has.dates ? cutoffDate : null,
      region: county,
    }),
    [
      county,
      region,
      pins,
      showRedPins,
      showYellowPins,
      showGreenPins,
      showMissing,
      catToggles,
      searchTerm,
      cutoffDate,
    ],
  );
  const applyPreset = (name) => {
    if (!PRESETS[name]) return;
    setPins(PRESETS[name]);
    setPreset(name);
  };
  // Dragging the sliders onto a preset's values selects that preset.
  useEffect(() => {
    const match = Object.entries(PRESETS).find(([, v]) => v[0] === pins[0] && v[1] === pins[1]);
    setPreset(match ? match[0] : null);
  }, [pins]);

  // ── Pages and panels ─────────────────────────────────────────────────────────
  const [page, setPage] = useState("map"); // "map" | "learn"
  // The Saved panel: beside the drawer on desktop, a full-screen page on phones.
  const [accountOpen, setAccountOpen] = useState(false);
  const [focusArea, setFocusArea] = useState(null); // { id, n }: scroll Saved to this area
  // Phones: which full-screen layer is on top, the account page or the info drawer.
  const [mobileTop, setMobileTop] = useState("account");
  const [sheetH, setSheetH] = useState(0); // phones: resting height of the drawer sheet
  const accountFullscreen = accountOpen && isMobile && page === "map";
  const [loginOpen, setLoginOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);
  const [tableH, setTableH] = useState(null); // Table View size, kept across close/reopen
  const [tableW, setTableW] = useState(null);
  const [frontPanel, setFrontPanel] = useState("drawer"); // "drawer" | "table": which is on top

  useEffect(() => {
    if (!user) setAccountOpen(false);
  }, [user]);

  // On phones the Saved page goes over the map and over any open drawer.
  const openSavedPanel = (focus = null) => {
    setPage("map");
    setMobileTop("account");
    setFocusArea(focus);
    setAccountOpen(true);
  };
  const toggleAccount = () => {
    if (accountOpen && page === "map") setAccountOpen(false);
    else openSavedPanel();
  };
  const backToMap = () => {
    setPage("map");
    setAccountOpen(false);
  };

  // ── Data and the map ─────────────────────────────────────────────────────────
  const { geoData, getFeature, similarEids, coordIndex } = useMapFeatures();
  const drawer = useDrawer(getFeature);
  const watchlist = useWatchlist({
    user,
    similarEids,
    onSignInNeeded: () => setLoginOpen(true),
  });
  const map = useMapLibre({
    containerRef,
    geoData,
    getFeature,
    coordIndex,
    filters,
    savedIds: watchlist.savedIds,
    drawerOpen: !!drawer.selected,
    searchTerm,
    onToggleSaved: watchlist.toggleSaved,
    onOpenDrawer: drawer.open,
    onBackgroundClick: drawer.close,
    onReady: onMapReady,
  });
  useWatchAreaLayer({
    mapRef: map.mapRef,
    mapReady: map.mapReady,
    watchAreas: watchlist.watchAreas,
    pinnedSlot: map.pinnedSlot,
    onOpenPanel: (areaId) => openSavedPanel({ id: areaId, n: Date.now() }),
    onCommit: watchlist.commitAreaEdit,
  });

  // ── Opening places from the panels ───────────────────────────────────────────
  const { open: openDrawerRaw } = drawer;
  const { openPopup, hoverPopup, endHover, showRowPopup, easeTo } = map;

  // A place opened from a panel switches the map to its county's pins.
  const openDrawer = React.useCallback(
    (eid, props) => {
      setCounty(isBullittId(eid) ? BULLITT : DEFAULT_REGION);
      openDrawerRaw(eid, props);
    },
    [openDrawerRaw],
  );

  const closeDrawer = () => {
    drawer.close();
    setMobileTop("account"); // with the drawer gone, an open account page is on top again
  };

  // Picking a county closes what belongs to the other one and frames the new one.
  const pickCounty = (id) => {
    if (id === county) return;
    setCounty(id);
    closeDrawer();
    map.closePopups();
    map.fitBounds(regionById(id).bounds, {
      padding: isMobile
        ? { top: 150, bottom: 90, left: 16, right: 16 }
        : { top: 90, bottom: 60, left: 60, right: 60 },
      duration: 700,
    });
  };

  // Hovering a What's New or Table View row shows the place's popup, without moving the map.
  const hoverPlace = React.useCallback(
    (eid) => {
      const f = getFeature(eid);
      if (f) hoverPopup(f);
    },
    [getFeature, hoverPopup],
  );

  // What's New: a place with a pin gets its popup too; one without leaves the map alone.
  const openFromWhatsNew = (eid, row) => {
    const f = getFeature(eid);
    if (f) {
      openPopup(f);
      openDrawer(eid, f.properties);
      return;
    }
    openDrawer(eid, {
      name: row?.premise_name,
      address: row?.address,
      date: row?.inspection_date ?? row?.inspection_date_recent,
      score: row?.score ?? row?.score_recent ?? null,
      grade: row?.grade ?? row?.grade_recent ?? null,
    });
  };

  // Table View: the place's popup, the map eased to it, and the drawer.
  const openFromTable = React.useCallback(
    (row) => {
      endHover();
      const f = getFeature(row.establishment_id);
      if (f) {
        showRowPopup(f);
        easeTo({ center: f.geometry.coordinates, duration: 400 });
      }
      openDrawer(row.establishment_id, row);
    },
    [getFeature, endHover, showRowPopup, easeTo, openDrawer],
  );

  // The Saved panel. On desktop the map is visible beside it, so also show the place's
  // popup and centre it clear of the right-hand panels. On phones the drawer opens over
  // the account page; closing it leaves the account page open.
  const openFromAccount = (eid, row) => {
    const f = getFeature(eid);
    const props = f?.properties ?? {
      name: row?.name,
      address: row?.address,
      date: row?.inspection_date,
      score: row?.score ?? null,
      grade: row?.grade ?? null,
    };
    if (!isMobile && f) {
      openPopup(f);
      easeTo({
        center: f.geometry.coordinates,
        offset: [-Math.round((ACCOUNT_PANEL_W + 12 + 420) / 2), 0],
        duration: 450,
      });
    }
    setMobileTop("drawer");
    openDrawer(eid, props);
  };

  return (
    <>
      <AppHeader
        page={page}
        showSearch={page === "map" && !accountFullscreen}
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        onBackToMap={backToMap}
        onOpenLearn={() => setPage("learn")}
        onOpenFeedback={() => setFeedbackOpen(true)}
        user={user}
        accountActive={accountOpen && page === "map"}
        onToggleAccount={toggleAccount}
        onLogIn={() => setLoginOpen(true)}
      />

      {page === "learn" && (
        <LearnPage
          loginOpen={loginOpen}
          onCloseLogin={() => setLoginOpen(false)}
          supabase={supabase}
          mapCutoffDate={cutoffDate}
          onOpenEstablishment={(eid) => {
            setPage("map");
            const f = getFeature(eid);
            if (f) openDrawer(eid, f.properties);
          }}
        />
      )}

      {/* The Learn page renders its own copy of the sign-in modal */}
      {page === "map" && loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}

      {page === "map" && accountOpen && user && (
        <AccountPage
          variant={isMobile ? "page" : "panel"}
          onClose={() => setAccountOpen(false)}
          focusAreaId={focusArea}
          zIndex={isMobile ? (mobileTop === "drawer" && drawer.selected ? 50 : 3300) : undefined}
          bottomInset={isMobile && drawer.selected && mobileTop === "drawer" ? sheetH : 0}
          onOpenEstablishment={openFromAccount}
          activeEid={drawer.selected?.establishment_id}
          onItemRemoved={watchlist.forgetSaved}
          refreshToken={watchlist.savedIds}
        />
      )}

      {feedbackOpen && <FeedbackModal supabase={supabase} onClose={() => setFeedbackOpen(false)} />}

      {/* The map stays mounted off the map page, just hidden */}
      <div
        ref={containerRef}
        className="map-container"
        style={
          page !== "map" || accountFullscreen
            ? { visibility: "hidden", pointerEvents: "none" }
            : undefined
        }
      />

      {page === "map" && (
        <InfoDrawer
          selected={drawer.selected}
          drawerLoading={drawer.loading}
          history={drawer.history}
          facDetails={drawer.details}
          pins={pins}
          zIndex={frontPanel === "drawer" ? 3100 : 2900}
          onBringToFront={() => setFrontPanel("drawer")}
          onSwitchTo={(eid) => {
            const f = getFeature(eid);
            if (f) openDrawer(eid, f.properties);
          }}
          onClose={closeDrawer}
          onSheetHeight={setSheetH}
          rightOffset={accountOpen && !isMobile && user ? ACCOUNT_PANEL_W + 12 : 0}
          watchlisted={
            !!drawer.selected && watchlist.savedIds.has(drawer.selected.establishment_id)
          }
          // Saved places only cover Louisville's tables so far (lib/regions.js).
          onSaveToWatchlist={
            isBullittId(drawer.selected?.establishment_id) ? undefined : watchlist.toggleSaved
          }
        />
      )}

      {page === "map" && !accountFullscreen && (
        <>
          <FilterSearch
            showRedPins={showRedPins}
            setShowRedPins={setShowRedPins}
            showYellowPins={showYellowPins}
            setShowYellowPins={setShowYellowPins}
            showGreenPins={showGreenPins}
            setShowGreenPins={setShowGreenPins}
            showMissing={showMissing}
            setShowMissing={setShowMissing}
            catToggles={catToggles}
            setCatToggles={setCatToggles}
            CATEGORY_SPECS={CATEGORY_SPECS}
            buildInitialCatToggles={buildInitialCatToggles}
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
            region={region}
            countyPicker={
              <CountyPicker regions={enabledRegions()} value={county} onChange={pickCounty} />
            }
          />

          {!tableOpen && (
            <button
              className="table-toggle-btn"
              onClick={() => {
                setTableOpen(true);
                setWhatsNewOpen(false);
              }}
              aria-label="Open table view"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M3 15h18M9 3v18" />
              </svg>
              Table View
            </button>
          )}

          <WhatsNew
            supabase={supabase}
            open={whatsNewOpen}
            onClose={() => setWhatsNewOpen(false)}
            onOpen={() => {
              setWhatsNewOpen(true);
              setTableOpen(false);
            }}
            onOpenEstablishment={openFromWhatsNew}
            onHoverEstablishment={hoverPlace}
            onHoverEstablishmentEnd={endHover}
          />

          <TableView
            supabase={supabase}
            onClose={() => setTableOpen(false)}
            onRowClick={openFromTable}
            onRowHover={hoverPlace}
            onRowHoverEnd={endHover}
            savedH={tableH}
            savedW={tableW}
            onResize={(h, w) => {
              setTableH(h);
              setTableW(w);
            }}
            hidden={!tableOpen}
            zIndex={frontPanel === "table" ? 3100 : 2900}
            onBringToFront={() => setFrontPanel("table")}
          />
        </>
      )}
    </>
  );
}
