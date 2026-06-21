/**
 * beginDrawerLoad — standalone async function for loading inspection drawer data.
 *
 * Extracted from Map.jsx so it can be tested independently and reused
 * across Map and AccountPage (via onOpenEstablishment).
 *
 * @param {string}   eid         establishment_id
 * @param {object}   p           feature properties from the GeoJSON pin
 * @param {object}   ctx         context object
 * @param {object}   ctx.supabase       Supabase client
 * @param {object}   ctx.loadSeqRef     ref tracking the current load sequence
 * @param {function} ctx.setDrawerLoading
 * @param {function} ctx.setHistory
 * @param {function} ctx.setHistoryFor
 * @param {function} ctx.setFacDetails
 * @param {function} ctx.setFacDetailsFor
 * @param {function} ctx.setSelected
 * @param {function} ctx.formatDateSafe
 */
export async function beginDrawerLoad(eid, p, ctx) {
  const {
    supabase,
    loadSeqRef,
    setDrawerLoading,
    setHistory,
    setHistoryFor,
    setFacDetails,
    setFacDetailsFor,
    setSelected,
    formatDateSafe,
  } = ctx;

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

  const byId   = new Map();
  const byDate = new Map();
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
    const viaId   = byId.get(r.inspection_id)  || [];
    const viaDate = byDate.get(r.inspection_date) || [];
    const seen = new Set();
    const violations = [];
    for (const x of [...viaId, ...viaDate]) {
      const k = x.violation_oid || `${x.inspection_id}-${x.violation_desc}`;
      if (!seen.has(k)) { seen.add(k); violations.push(x); }
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
    const byDateMatch = mergedDesc.find((r) => r.inspection_date === p.date);
    if (byDateMatch) return byDateMatch;
    const latestNonZero = mergedDesc.find((r) => (r.score ?? 0) > 0);
    return latestNonZero || mergedDesc[0] || null;
  })();

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

  // Single query via v_facility_details
  let details = null;
  let fullAddress = null;
  {
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

  setSelected({ ...selectedData, address: fullAddress || selectedData.address });
  setHistory(mergedDesc);
  setHistoryFor(eid);
  setFacDetails(details);
  setFacDetailsFor(eid);
  setDrawerLoading(false);
}
