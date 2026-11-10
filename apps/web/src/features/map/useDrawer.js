// The info drawer's data: which place is open, its inspection history and its details.
// open(eid, props) shows the card at once from what the caller already has (a pin's
// properties or a list row), then loads the history, violations and details.
import { useCallback, useRef, useState } from "react";
import { fetchFacilityDetails, fetchInspections, fetchViolations } from "../../api/mapData.js";
import { fetchBullittInspections } from "../../api/bullitt.js";
import { BULLITT, bullittHeader, bullittHistory, isBullittId } from "../../lib/bullitt.js";
import { regionById } from "../../lib/regions.js";
import {
  attachViolations,
  parseSimilarNearby,
  pickHeaderInspection,
} from "../../lib/inspectionHistory.js";
import { joinAddress } from "../../lib/mapFeatures.js";
import { formatDateSafe } from "../../lib/dates.js";

const HEADER_NOTE =
  "Most recent inspection with a non-zero score. Newer zero-score visits appear below as N/A.";

const BULLITT_NOTE =
  `From the ${regionById(BULLITT).source.name}, which publishes each place's latest ` +
  "inspection without its date. Earlier ones appear here as this site records them.";

// getFeature: establishment id -> map feature, or nothing when the place has no pin.
export function useDrawer(getFeature) {
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

  // Bullitt County: one table, no details, and the header is the current routine
  // inspection (lib/bullitt.js).
  const loadBullitt = useCallback(async (eid, seq) => {
    const { data, error } = await fetchBullittInspections(eid);
    if (seq !== loadSeq.current) return;
    if (error) console.error("Bullitt history fetch error", error);
    const rows = bullittHistory(data);
    const header = bullittHeader(rows);
    setSelected((s) => ({
      ...s,
      inspectionDate: header
        ? (header.date_label ?? formatDateSafe(header.inspection_date))
        : s.inspectionDate,
      score: header?.score ?? s.score,
      _displayedInspectionId: header?.inspection_id ?? null,
      sourceNote: BULLITT_NOTE,
    }));
    setHistory(rows);
    setDetails(null);
    setLoading(false);
  }, []);

  const open = useCallback(
    async (eid, p) => {
      const seq = ++loadSeq.current;
      const noLocation = !getFeature(eid); // the drawer explains why there's no pin
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
        score: p.score ?? null,
        grade: p.grade ?? null,
        _displayedInspectionId: null,
        similarNearby,
        metaTitle: "",
        noLocation,
      });

      if (isBullittId(eid)) {
        await loadBullitt(eid, seq);
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
    [getFeature, loadBullitt],
  );

  return { selected, history, details, loading, open, close };
}
