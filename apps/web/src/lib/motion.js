// Reduced motion (WCAG 2.3.3): when the visitor's system asks for less, the map jumps instead
// of gliding and scrolling doesn't animate. The CSS side is one rule in index.css. Pure
// apart from the window passed in.

export const prefersReducedMotion = (win = globalThis.window) =>
  Boolean(win?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);

/** MapLibre camera options with the animation taken out when motion is reduced. */
export function cameraOptions(options = {}, win = globalThis.window) {
  return prefersReducedMotion(win) ? { ...options, duration: 0, animate: false } : options;
}

/** "smooth" or "auto", for scrollIntoView and scrollTo. */
export const scrollBehavior = (win = globalThis.window) =>
  prefersReducedMotion(win) ? "auto" : "smooth";
