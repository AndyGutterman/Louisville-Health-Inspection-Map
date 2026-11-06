// Sizing and gesture rules for the phone info drawer (a bottom sheet with two
// resting heights: "peek" and "expanded"). Pure functions, so they are easy to test.

// How much of the screen the sheet covers when fully expanded.
export const EXPANDED_FRACTION = 0.74;
// A drag faster than this (pixels per millisecond) is a fling, not a slow drag.
export const FLING_V = 0.5;

export const expandedHeight = (viewportH) => Math.round(viewportH * EXPANDED_FRACTION);

// Peek shows the card, the history heading and about one and a half history rows.
// `firstRowTop` is the distance from the sheet's top edge to the first history row.
export function computePeekHeight({ firstRowTop, rowHeight, viewportH, fallback = 340 }) {
  const max = Math.round(viewportH * 0.6);
  if (firstRowTop == null) return Math.min(fallback, max);
  const h = Math.round(firstRowTop + (rowHeight || 70) * 1.5);
  return Math.max(240, Math.min(h, max));
}

// Keeps a dragged sheet between a little under peek and a little over expanded.
export function clampSheetHeight(h, peekH, expandedH) {
  return Math.max(Math.round(peekH * 0.5), Math.min(expandedH + 24, Math.round(h)));
}

// What to do when the finger lifts. `velocity` is px/ms, positive when moving up.
// Returns "close", "peek" or "expanded".
export function resolveSheetRelease({ height, velocity, snap, peekH, expandedH }) {
  if (height < peekH - 60 || (snap === "peek" && velocity < -0.6)) return "close";
  if (velocity > FLING_V) return "expanded";
  if (velocity < -FLING_V) return "peek";
  return Math.abs(height - expandedH) < Math.abs(height - peekH) ? "expanded" : "peek";
}
