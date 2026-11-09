import { describe, expect, it } from "vitest";
import {
  HIT_LAYER,
  RING_BONUS,
  RING_LAYER,
  pickPin,
  pinPriority,
  uniqueHits,
} from "./pinPicking.js";

const hit = (id, layer, props = {}) => ({
  layer: { id: layer },
  properties: { establishment_id: id, ...props },
});
const at = (distances) => (f) => distances[f.properties.establishment_id];

describe("pinPriority", () => {
  it("ranks red over yellow over green", () => {
    expect(pinPriority(hit("a", "points-red"))).toBeGreaterThan(
      pinPriority(hit("b", "points-yellow")),
    );
    expect(pinPriority(hit("b", "points-yellow"))).toBeGreaterThan(
      pinPriority(hit("c", "points-green")),
    );
  });

  it("adds a bonus for a place with violations", () => {
    const plain = hit("a", "points-green");
    const ringed = hit("a", "points-green", { has_any_violation: true });
    expect(pinPriority(ringed) - pinPriority(plain)).toBe(RING_BONUS);
  });
});

describe("uniqueHits", () => {
  it("keeps one hit per place, preferring the pin layer over the ring", () => {
    const ring = hit("a", RING_LAYER, { has_any_violation: true });
    const pin = hit("a", "points-red", { has_any_violation: true });
    expect(uniqueHits([ring, pin])).toEqual([pin]);
    expect(uniqueHits([pin, ring])).toEqual([pin]);
  });

  it("prefers the pin over the invisible tap target too", () => {
    const target = hit("a", HIT_LAYER, { has_any_violation: true });
    const pin = hit("a", "points-green", { has_any_violation: true });
    expect(uniqueHits([target, pin])).toEqual([pin]);
  });

  it("keeps a ring hit when the pin itself wasn't hit", () => {
    const ring = hit("a", RING_LAYER, { has_any_violation: true });
    expect(uniqueHits([ring])).toEqual([ring]);
  });
});

describe("pickPin", () => {
  it("returns null with nothing near", () => {
    expect(pickPin([], () => 0)).toBeNull();
  });

  it("picks the closest pin of the same kind", () => {
    const a = hit("a", "points-green");
    const b = hit("b", "points-green");
    expect(pickPin([a, b], at({ a: 9, b: 3 }))).toBe(b);
  });

  it("prefers a ringed place a few pixels further away", () => {
    const clean = hit("clean", "points-green");
    const ringed = hit("ringed", "points-green", { has_any_violation: true });
    expect(pickPin([clean, ringed], at({ clean: 2, ringed: 8 }))).toBe(ringed);
  });

  it("still picks a much closer clean pin", () => {
    const clean = hit("clean", "points-green");
    const ringed = hit("ringed", "points-green", { has_any_violation: true });
    expect(pickPin([clean, ringed], at({ clean: 1, ringed: 20 }))).toBe(clean);
  });
});
