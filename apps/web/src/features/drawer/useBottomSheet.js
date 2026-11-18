// Phones: the info drawer is a bottom sheet that rests at "peek" (the card and about 1.5
// history rows) or "expanded", and is dragged between them by its handle. Dragging well
// below peek, or flinging down from it, closes the drawer. The rules: lib/bottomSheet.js.
import React from "react";
import {
  expandedHeight,
  computePeekHeight,
  clampSheetHeight,
  resolveSheetRelease,
} from "../../lib/bottomSheet.js";

/**
 * @param {object} o
 * @param {boolean} o.isMobile
 * @param {object|null} o.selected     the place open in the drawer
 * @param {object[]|null} o.history    its inspections (the peek height is measured on them)
 * @param {boolean} o.drawerLoading
 * @param {Function} [o.onSheetHeight] told the resting height, 0 when there is no sheet
 * @param {Function} [o.onClose]
 */
export function useBottomSheet({
  isMobile,
  selected,
  history,
  drawerLoading,
  onSheetHeight,
  onClose,
}) {
  const sheetRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const gestureRef = React.useRef(null);
  const [snap, setSnap] = React.useState("peek");
  const [peekH, setPeekH] = React.useState(340);
  const [dragH, setDragH] = React.useState(null); // px while the handle is being dragged
  const [animate, setAnimate] = React.useState(false);
  const [vh, setVh] = React.useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 800,
  );
  const hasSelected = !!selected;
  const eid = selected?.establishment_id;
  const expandedH = expandedHeight(vh);

  React.useEffect(() => {
    const onResize = () => setVh(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Every fresh open starts at peek.
  React.useEffect(() => {
    if (!hasSelected) {
      setSnap("peek");
      setDragH(null);
      setAnimate(false);
    }
  }, [hasSelected]);

  // Measure where the first history row sits, so peek shows exactly 1.5 rows.
  React.useLayoutEffect(() => {
    if (!isMobile || !hasSelected) return;
    const sheet = sheetRef.current;
    const body = bodyRef.current;
    if (!sheet || !body) return;
    const row = body.querySelector(".hist-item, .hist-skeleton-row");
    setPeekH(
      computePeekHeight({
        firstRowTop: row
          ? row.getBoundingClientRect().top - sheet.getBoundingClientRect().top + body.scrollTop
          : null,
        rowHeight: row ? row.offsetHeight : 0,
        viewportH: vh,
      }),
    );
    const id = requestAnimationFrame(() => setAnimate(true)); // no grow-in on first paint
    return () => cancelAnimationFrame(id);
  }, [isMobile, hasSelected, eid, history, drawerLoading, vh]);

  const restH = snap === "expanded" ? expandedH : peekH;
  const sheetH = dragH ?? restH;

  // Tell the parent the resting height (not every pixel of a drag).
  React.useEffect(() => {
    onSheetHeight?.(isMobile && hasSelected ? restH : 0);
  }, [onSheetHeight, isMobile, hasSelected, restH]);

  const onHandleDown = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const now = performance.now();
    gestureRef.current = {
      y0: e.clientY,
      h0: sheetRef.current ? sheetRef.current.getBoundingClientRect().height : restH,
      moved: false,
      lastY: e.clientY,
      lastT: now,
      v: 0,
      h: null,
    };
  };

  const onHandleMove = (e) => {
    const g = gestureRef.current;
    if (!g) return;
    const dy = g.y0 - e.clientY; // up is positive
    if (Math.abs(dy) > 6) g.moved = true;
    if (!g.moved) return;
    const now = performance.now();
    g.v = (g.lastY - e.clientY) / Math.max(1, now - g.lastT);
    g.lastY = e.clientY;
    g.lastT = now;
    g.h = clampSheetHeight(g.h0 + dy, peekH, expandedH);
    setDragH(g.h);
  };

  const onHandleUp = (e) => {
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g) return;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* already released */
    }
    if (!g.moved) {
      setSnap((cur) => (cur === "peek" ? "expanded" : "peek")); // a tap toggles
      return;
    }
    const next = resolveSheetRelease({
      height: g.h ?? g.h0,
      velocity: g.v,
      snap,
      peekH,
      expandedH,
    });
    setDragH(null);
    if (next === "close") onClose?.();
    else setSnap(next);
  };

  return {
    sheetRef,
    bodyRef,
    snap,
    setSnap,
    sheetH,
    dragH,
    animate,
    onHandleDown,
    onHandleMove,
    onHandleUp,
  };
}
