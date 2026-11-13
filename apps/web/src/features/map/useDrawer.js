// The info drawer's data: which place is open, its inspection history and its details.
// open(eid, props) shows the card at once from what the caller already has (a pin's
// properties or a list row), then loads the history, violations and details.
import { useCallback, useRef, useState } from "react";
import { fetchFacilityDetails, fetchInspections, fetchViolations } from "../../api/mapData.js";
import { fetchBullittInspections } from "../../api/bullitt.js";
import { fetchPortalInspections } from "../../api/portal.js";
import {
  BULLITT,
  ESTIMATE_NOTE,
  bullittHeader,
  bullittHistory,
  bullittSourceNote,
  isBullittId,
} from "../../lib/bullitt.js";
import { portalHeader, portalHistory, portalSourceNote } from "../../lib/portal.js";
import { regionById, regionOfId } from "../../lib/regions.js";
import {
  attachViolations,
  parseSimilarNearby,
  pickHeaderInspection,
} from "../../lib/inspectionHistory.js";
import { joinAddress } from "../../lib/mapFeatures.js";
import { formatDateSafe } from "../../lib/dates.js";

const HEADER_NOTE =
  "Most recent inspection with a non-zero score. Newer zero-score visits appear below as N/A.";

const ESTIMATED = "Date (estimated)";

// getFeature: establishment id -> map feature, or nothing when the place has no pin.
// countyOnMap(regionId): whether that county's pins are on the map. A place in a county
// that is switched off has no feature either, but that doesn't mean it has no location.
export function useDrawer(getFeature, countyOnMap = () => true) {
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  // Bumped by every open and close, so a slow load for an earlier place is ignored.
  const loadSeq = useRef(0);

  const close = useCallback(() => {
    loadSeq.current++;
    setSelected(null);
    setHistory(null);
    setDetails(null);
    setLoading(false);
  }, []);

  // Bullitt County: one list of results, no details, and the header is the latest record
  // (lib/bullitt.js). Results from the portal are dated; undated ones from the sheet that
  // appeared after its first load get an estimate, and the note then explains "By".
  const loadBullitt = useCallback(
    async (eid, seq, p) => {
      const { data, error } = await fetchBullittInspections(eid);
      if (seq !== loadSeq.current) return;
      if (error) console.error("Bullitt history fetch error", error);
      // Opened from a list, the row may not carry the feed's first-load date: the pin does.
      const trackingSince = p.tracking_since ?? getFeature(eid)?.properties?.tracking_since ?? null;
      const rows = bullittHistory(data, { trackingSince });
      const header = bullittHeader(rows);
      const anyEstimate = rows.some((r) => r.date_estimated);
      setSelected((s) => ({
        ...s,
        inspectionDate: header
          ? (header.date_label ?? formatDateSafe(header.inspection_date))
          : s.inspectionDate,
        dateCaption: header?.date_estimated ? ESTIMATED : undefined,
        score: header?.score ?? s.score,
        _displayedInspectionId: header?.inspection_id ?? null,
        sourceNote: [bullittSourceNote(rows, regionById(BULLITT).agency.name)]
          .concat(anyEstimate ? [ESTIMATE_NOTE] : [])
          .join(" "),
      }));
      setHistory(rows);
      setDetails(null);
      setLoading(false);
    },
    [getFeature],
  );

  // A county read from Kentucky's portal (Oldham): like Bullitt's, but every result is
  // dated, and the header shows what the pin does (lib/portal.js).
  const loadPortal = useCallback(async (eid, seq, region) => {
    const { data, error } = await fetchPortalInspections(eid);
    if (seq !== loadSeq.current) return;
    if (error) console.error(`${region.shortName} history fetch error`, error);
    const rows = portalHistory(data, { county: region.name });
    const header = portalHeader(rows);
    setSelected((s) => ({
      ...s,
      inspectionDate: header?.inspection_date
        ? formatDateSafe(header.inspection_date)
        : s.inspectionDate,
      score: header?.score ?? s.score,
      _displayedInspectionId: header?.inspection_id ?? null,
      sourceNote: portalSourceNote(rows, region.agency.name),
    }));
    setHistory(rows);
    setDetails(null);
    setLoading(false);
  }, []);

  const open = useCallback(
    async (eid, p) => {
      const seq = ++loadSeq.current;
      // The drawer explains why there's no pin, if the pin should have been there.
      const noLocation = !getFeature(eid) && countyOnMap(regionOfId(eid).id);
      const similarNearby = parseSimilarNearby(p.similar_nearby);
      setLoading(true);
      setHistory(null);
      setDetails(null);

      // 1. The card, straight away. The history shows a skeleton meanwhile.
      setSelected({
        establishment_id: eid,
        name: p.name,
        address: p.address_full || p.address,
        inspectionDate: p.date_text ?? formatDateSafe(p.date),
        dateCaption: p.date_estimated ? ESTIMATED : undefined,
        score: p.score ?? null,
        grade: p.grade ?? null,
        _displayedInspectionId: null,
        similarNearby,
        metaTitle: "",
        noLocation,
      });

      if (isBullittId(eid)) {
        await loadBullitt(eid, seq, p);
        return;
      }
      const region = regionOfId(eid);
      if (region.feed === "portal") {
        await loadPortal(eid, seq, region);
        return;
      }

      // 2. History, with each inspection's violations.
      const { data: inspections, error: inspErr } = await fetchInspections(eid);
      if (inspErr) {
        console.error("history fetch error", inspErr);
        if (seq === loadSeq.current) setLoading(false);
        return;
      }
      const { data: violations, error: vErr } = await fetchViolations(eid);
      if (vErr) console.error("violations fetch error", vErr);
      if (seq !== loadSeq.current) return;
      const rows = attachViolations(inspections, violations);

      // The header shows the newest inspection with a score.
      const header = pickHeaderInspection(rows);
      const summary = header
        ? {
            establishment_id: eid,
            name: p.name,
            address: p.address,
            inspectionDate: formatDateSafe(header.inspection_date),
            score: header.score ?? null,
            grade: header.grade ?? null,
            _displayedInspectionId: header.inspection_id,
            noLocation,
            similarNearby,
            metaTitle: (header.score ?? 0) > 0 ? HEADER_NOTE : "",
          }
        : {
            establishment_id: eid,
            name: p.name,
            address: p.address,
            inspectionDate: formatDateSafe(p.date),
            score: p.score ?? null,
            grade: p.grade ?? null,
            _displayedInspectionId: null,
            noLocation,
            similarNearby,
            meta: null,
          };

      // 3. "More info" details and the full address.
      const { data: fac, error: facErr } = await fetchFacilityDetails(eid);
      if (facErr) console.error("v_facility_details fetch error", facErr);
      if (seq !== loadSeq.current) return; // another place was opened meanwhile
      const fullAddress = joinAddress({
        address: fac?.address || p.address,
        city: fac?.city,
        state: fac?.state,
        zip: fac?.zip,
      });

      setSelected({ ...summary, address: fullAddress || summary.address });
      setHistory(rows);
      setDetails({
        opening_date: fac?.opening_date ? formatDateSafe(fac.opening_date) : null,
        facility_type: fac?.facility_type_description ?? fac?.facility_type ?? null,
        subtype: fac?.subtype_description ?? fac?.subtype ?? null,
        permit_number: fac?.permit_number ?? null,
      });
      setLoading(false);
    },
    [getFeature, countyOnMap, loadBullitt, loadPortal],
  );

  return { selected, history, details, loading, open, close };
}
