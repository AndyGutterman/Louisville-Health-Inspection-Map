// Geocode now: start the pin-fixes job (api/pins.js startPinJob) for the address fixes
// waiting, then watch them come back: a small read every 10 s while any is still
// waiting, for at most 5 minutes (lib/pinQueue.js keepPolling).
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFixStatus, fetchPinQueue, startPinJob } from "../../api/pins.js";
import { whyNotStarted } from "../../lib/adminEmail.js";
import { POLL_MS, jobNotice, keepPolling } from "../../lib/pinQueue.js";

/**
 * @param {object} byRegion  lib/pinQueue.js countsByRegion(...)
 * @param {Function} onChange  called once the run is over, to reload counts and queue
 * @returns {{ run: object|null, start: Function, notice: object|null, clearNotice: Function }}
 *   run: { places: [{ id, name, status, result_provider }], watching: boolean }
 */
export function usePinJob(byRegion, onChange) {
  const [run, setRun] = useState(null);
  const [notice, setNotice] = useState(null);
  const timer = useRef(null);
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
      clearTimeout(timer.current);
    },
    [],
  );

  const start = useCallback(async () => {
    clearTimeout(timer.current);
    // The waiting fixes, from each county that has some (the job takes them all).
    const regions = Object.keys(byRegion).filter((id) => byRegion[id].pending > 0);
    const waiting = (
      await Promise.all(regions.map((region) => fetchPinQueue({ region, bucket: "pending" })))
    ).flat();
    if (!waiting.length) return;
    const places = waiting.map((r) => ({ id: r.id, name: r.name, status: "pending" }));
    const result = await startPinJob();
    if (!live.current) return;
    setNotice(jobNotice(result, places.length, whyNotStarted));
    setRun({ places, watching: result.started });
    if (!result.started) return;

    const startedAt = Date.now();
    const poll = async () => {
      let rows;
      try {
        rows = await fetchFixStatus(places.map((p) => p.id));
      } catch {
        rows = null; // a missed read: try again next time
      }
      if (!live.current) return;
      if (rows) {
        const byId = new Map(rows.map((r) => [r.place_id, r]));
        for (const p of places) {
          const r = byId.get(p.id);
          if (r) Object.assign(p, { status: r.status, result_provider: r.result_provider });
        }
      }
      const more = keepPolling({
        startedAt,
        now: Date.now(),
        statuses: places.map((p) => p.status),
      });
      setRun({ places: places.map((p) => ({ ...p })), watching: more });
      if (more) timer.current = setTimeout(poll, POLL_MS);
      else onChange();
    };
    timer.current = setTimeout(poll, POLL_MS);
  }, [byRegion, onChange]);

  return { run, start, notice, clearNotice: () => setNotice(null) };
}
