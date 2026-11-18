import { describe, expect, it } from "vitest";
import { wrapTarget } from "./focusTrap.js";

const [a, b, c] = ["a", "b", "c"];

describe("wrapTarget", () => {
  it("lets Tab move on inside the dialog", () => {
    expect(wrapTarget([a, b, c], a, false)).toBeNull();
    expect(wrapTarget([a, b, c], b, false)).toBeNull();
    expect(wrapTarget([a, b, c], b, true)).toBeNull();
  });

  it("wraps from the last to the first, and the first back to the last", () => {
    expect(wrapTarget([a, b, c], c, false)).toBe(a);
    expect(wrapTarget([a, b, c], a, true)).toBe(c);
  });

  it("pulls focus back in when it is outside the dialog", () => {
    expect(wrapTarget([a, b, c], "outside", false)).toBe(a);
    expect(wrapTarget([a, b, c], "outside", true)).toBe(c);
  });

  it("does nothing for a dialog with nothing to focus", () => {
    expect(wrapTarget([], a, false)).toBeNull();
  });
});
