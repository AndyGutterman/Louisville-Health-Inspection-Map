// Desktop: the info drawer's width, dragged by its left edge.
import React from "react";

const DRAWER_MIN_W = 360;
const DRAWER_MAX_W = 1100;

export function useDrawerWidth() {
  const defaultW = () => Math.min(420, Math.round(window.innerWidth * 0.82));
  const [drawerW, setDrawerW] = React.useState(defaultW);
  const dragRef = React.useRef({ on: false });

  const onLeftEdgeDown = React.useCallback(
    (e) => {
      e.preventDefault();
      dragRef.current = { on: true, x0: e.clientX, w0: drawerW };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [drawerW],
  );

  const onLeftEdgeMove = React.useCallback((e) => {
    if (!dragRef.current.on) return;
    const dx = dragRef.current.x0 - e.clientX; // drag left = wider
    setDrawerW(Math.max(DRAWER_MIN_W, Math.min(DRAWER_MAX_W, dragRef.current.w0 + dx)));
  }, []);

  const onLeftEdgeUp = React.useCallback(() => {
    dragRef.current.on = false;
  }, []);

  return { drawerW, onLeftEdgeDown, onLeftEdgeMove, onLeftEdgeUp };
}
