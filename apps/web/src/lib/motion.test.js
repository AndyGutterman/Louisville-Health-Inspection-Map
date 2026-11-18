import { describe, expect, it } from "vitest";
import { cameraOptions, prefersReducedMotion, scrollBehavior } from "./motion.js";

const win = (reduce) => ({ matchMedia: (q) => ({ matches: reduce && q.includes("reduce") }) });

describe("reduced motion", () => {
  it("reads the system setting, and assumes motion is fine without one", () => {
    expect(prefersReducedMotion(win(true))).toBe(true);
    expect(prefersReducedMotion(win(false))).toBe(false);
    expect(prefersReducedMotion({})).toBe(false);
    expect(prefersReducedMotion(undefined)).toBe(false);
  });

  it("takes the animation out of the camera moves, and leaves the rest alone", () => {
    const options = { center: [1, 2], zoom: 15, duration: 400 };
    expect(cameraOptions(options, win(true))).toEqual({ ...options, duration: 0, animate: false });
    expect(cameraOptions(options, win(false))).toBe(options);
    expect(cameraOptions(undefined, win(false))).toEqual({});
  });

  it("scrolls without animation", () => {
    expect(scrollBehavior(win(true))).toBe("auto");
    expect(scrollBehavior(win(false))).toBe("smooth");
  });
});
