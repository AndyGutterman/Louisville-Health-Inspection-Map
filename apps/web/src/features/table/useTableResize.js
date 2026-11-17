// The Table View panel's size: dragged by its top, bottom and right edges and by two
// corners. The parent is told the size, so it survives closing and reopening the table.
import { useCallback, useEffect, useRef, useState } from "react";
import { useLatest } from "../../hooks/useLatest.js";

/* ── drag: height ── */
const MIN_H = 180,
  MAX_H_FRAC = 0.88;
function useDragH(savedH) {
  const defaultH = () =>
    savedH != null
      ? savedH
      : Math.round(window.innerHeight * (window.innerWidth <= 600 ? 0.58 : 0.5));
  const [h, setH] = useState(defaultH);
  const d = useRef({});
  // Top edge: drag up = taller (y decreases)
  const down = useCallback(
    (e) => {
      d.current = { on: true, dir: "top", y0: e.clientY, h0: h };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [h],
  );
  // Bottom edge: drag down = taller (y increases)
  const downBottom = useCallback(
    (e) => {
      d.current = { on: true, dir: "bottom", y0: e.clientY, h0: h };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [h],
  );
  const move = useCallback((e) => {
    if (!d.current.on) return;
    const delta =
      d.current.dir === "bottom"
        ? e.clientY - d.current.y0 // drag down = bigger
        : d.current.y0 - e.clientY; // drag up   = bigger
    setH(Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_FRAC, d.current.h0 + delta)));
  }, []);
  const up = useCallback(() => {
    d.current.on = false;
  }, []);
  return { h, setH, downH: down, downHBottom: downBottom, moveH: move, upH: up };
}

/* ── drag: width ── */
const MIN_W = 320;
function useDragW(savedW) {
  const defaultW = () => {
    if (savedW != null) return savedW;
    const vw = window.innerWidth;
    if (vw <= 600) return vw;
    return Math.max(MIN_W, Math.min(vw * 0.54, vw - 556));
  };
  const [w, setW] = useState(defaultW);
  const d = useRef({});
  const down = useCallback(
    (e) => {
      d.current = { on: true, x0: e.clientX, w0: w };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [w],
  );
  const move = useCallback((e) => {
    if (!d.current.on) return;
    setW(
      Math.max(MIN_W, Math.min(window.innerWidth - 16, d.current.w0 + (e.clientX - d.current.x0))),
    );
  }, []);
  const up = useCallback(() => {
    d.current.on = false;
  }, []);
  return { w, setW, downW: down, moveW: move, upW: up };
}

/* ── drag: corner (diagonal) ── */
function useCornerDrag(setH, setW) {
  const d = useRef({});
  const down = useCallback((e, curH, curW) => {
    e.preventDefault();
    d.current = { on: true, x0: e.clientX, y0: e.clientY, h0: curH, w0: curW };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);
  const move = useCallback(
    (e) => {
      if (!d.current.on) return;
      const dx = e.clientX - d.current.x0;
      const dy = e.clientY - d.current.y0;
      setW(() => Math.max(MIN_W, Math.min(window.innerWidth - 16, d.current.w0 + dx)));
      setH(() => Math.max(MIN_H, Math.min(window.innerHeight * MAX_H_FRAC, d.current.h0 - dy)));
    },
    [setH, setW],
  );
  const up = useCallback(() => {
    d.current.on = false;
  }, []);
  return { downCorner: down, moveCorner: move, upCorner: up };
}

// savedH, savedW: the size from last time, or null. onResize(h, w): told on every change.
export function useTableResize(savedH, savedW, onResize) {
  const { h, setH, downH, downHBottom, moveH, upH } = useDragH(savedH);
  const { w, setW, downW, moveW, upW } = useDragW(savedW);
  const { downCorner, moveCorner, upCorner } = useCornerDrag(setH, setW);

  // The parent passes a new onResize function on every render; only a new size counts.
  const latestOnResize = useLatest(onResize);
  useEffect(() => {
    latestOnResize.current?.(h, w);
  }, [h, w, latestOnResize]);

  const onPanelMove = useCallback(
    (e) => {
      moveH(e);
      moveW(e);
      moveCorner(e);
    },
    [moveH, moveW, moveCorner],
  );
  const onPanelUp = useCallback(
    (e) => {
      upH(e);
      upW(e);
      upCorner(e);
    },
    [upH, upW, upCorner],
  );

  return { h, w, downH, downHBottom, downW, downCorner, onPanelMove, onPanelUp };
}
