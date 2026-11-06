import { describe, it, expect } from "vitest";
import { clampPins, PRESETS, bandExprs } from "./scoring.js";

// A tiny evaluator for the MapLibre expressions bandExprs builds, so the tests can
// check which band a score lands in without needing a map.
function evaluate(expr, props) {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr;
  const v = (a) => evaluate(a, props);
  switch (op) {
    case "get":
      return props[args[0]] ?? null;
    case "coalesce":
      for (const a of args) {
        const r = v(a);
        if (r !== null && r !== undefined) return r;
      }
      return null;
    case ">=":
      return v(args[0]) >= v(args[1]);
    case "<=":
      return v(args[0]) <= v(args[1]);
    case "==":
      return v(args[0]) === v(args[1]);
    case "all":
      return args.every(v);
    default:
      throw new Error(`unsupported expression: ${op}`);
  }
}

const bandsFor = (pins, score) => {
  const exprs = bandExprs(pins);
  return Object.keys(exprs).filter((band) => evaluate(exprs[band], { score }));
};

describe("clampPins", () => {
  it("leaves valid thresholds alone", () => {
    expect(clampPins([86, 94])).toEqual([86, 94]);
  });

  it("caps red at 98 and yellow at 99", () => {
    expect(clampPins([200, 500])).toEqual([98, 99]);
  });

  it("floors red at 1", () => {
    expect(clampPins([-5, 50])).toEqual([1, 50]);
  });

  it("keeps yellow at least one above red", () => {
    expect(clampPins([90, 80])).toEqual([90, 91]);
  });

  it("rounds to whole numbers", () => {
    expect(clampPins([84.6, 94.2])).toEqual([85, 94]);
  });
});

describe("PRESETS", () => {
  it("balanced matches Louisville's 84/85 grade cutoff", () => {
    expect(PRESETS.balanced).toEqual([84, 94]);
  });

  it.each(Object.entries(PRESETS))("%s is a valid pair", (_name, [r, y]) => {
    expect(r).toBeGreaterThanOrEqual(1);
    expect(r).toBeLessThanOrEqual(98);
    expect(y).toBeGreaterThan(r);
    expect(y).toBeLessThanOrEqual(99);
  });
});

describe("bandExprs", () => {
  it.each(Object.entries(PRESETS))(
    "%s puts every score from 1 to 100 in exactly one colour band",
    (_name, pins) => {
      for (let score = 1; score <= 100; score++) {
        const bands = bandsFor(pins, score);
        expect(bands, `score ${score}`).toHaveLength(1);
        expect(["red", "yellow", "green"]).toContain(bands[0]);
      }
    },
  );

  it("splits exactly at the thresholds", () => {
    const pins = [84, 94];
    expect(bandsFor(pins, 84)).toEqual(["red"]);
    expect(bandsFor(pins, 85)).toEqual(["yellow"]);
    expect(bandsFor(pins, 94)).toEqual(["yellow"]);
    expect(bandsFor(pins, 95)).toEqual(["green"]);
    expect(bandsFor(pins, 100)).toEqual(["green"]);
  });

  it("treats a score of 0 as its own band", () => {
    expect(bandsFor([84, 94], 0)).toEqual(["zero"]);
  });

  it("treats a missing score as its own band", () => {
    expect(bandsFor([84, 94], null)).toEqual(["null"]);
  });
});
