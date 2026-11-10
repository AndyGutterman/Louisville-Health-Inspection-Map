import { describe, it, expect } from "vitest";
import { isSubscribed, rememberDigestOptIn, takeDigestOptIn } from "./digest.js";

const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};

describe("digest opt-in", () => {
  it("is remembered once, then forgotten", () => {
    const s = memory();
    rememberDigestOptIn(true, s);
    expect(takeDigestOptIn(s)).toBe(true);
    expect(takeDigestOptIn(s)).toBe(false);
  });

  it("unticking forgets an earlier tick", () => {
    const s = memory();
    rememberDigestOptIn(true, s);
    rememberDigestOptIn(false, s);
    expect(takeDigestOptIn(s)).toBe(false);
  });

  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
      removeItem: () => {},
    };
    expect(() => rememberDigestOptIn(true, broken)).not.toThrow();
    expect(takeDigestOptIn(broken)).toBe(false);
  });

  it("reads the profile", () => {
    expect(isSubscribed({ alert_frequency: "weekly" })).toBe(true);
    expect(isSubscribed({ alert_frequency: "off" })).toBe(false);
    expect(isSubscribed(null)).toBe(false);
  });
});
