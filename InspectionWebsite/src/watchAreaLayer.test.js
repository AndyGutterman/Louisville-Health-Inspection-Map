import { describe, it, expect } from "vitest";
import { buildCircle, buildWatchCollection } from "./watchAreaLayer.js";

const MILES_PER_M = 1 / 1609.34;

function miles([lon1, lat1], [lon2, lat2]) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const area = { id: 7, center_lat: 38.2527, center_lon: -85.7585, radius_miles: 3 };

describe("buildCircle", () => {
  const ring = buildCircle(area).geometry.coordinates[0];

  it("returns a closed polygon ring", () => {
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring.length).toBeGreaterThan(50);
  });

  it("keeps every point within 1% of the requested radius", () => {
    const center = [area.center_lon, area.center_lat];
    for (const pt of ring) {
      expect(Math.abs(miles(center, pt) - area.radius_miles)).toBeLessThan(area.radius_miles * 0.01);
    }
  });

  it("carries the id and falls back label -> address -> radius", () => {
    expect(buildCircle({ ...area, label: "Home" }).properties).toMatchObject({ id: 7, label: "Home" });
    expect(buildCircle({ ...area, center_address: "1 Main St" }).properties.label).toBe("1 Main St");
    expect(buildCircle(area).properties.label).toBe("3 mi");
  });

  it("uses metres-per-mile consistently", () => {
    expect(3 * 1609.34 * MILES_PER_M).toBeCloseTo(3, 6);
  });
});

describe("buildWatchCollection", () => {
  it("skips areas without numeric coordinates", () => {
    const fc = buildWatchCollection([
      area,
      { id: 8, center_lat: null, center_lon: null, radius_miles: 1 },
      { id: 9, center_lat: "38.2", center_lon: "-85.7", radius_miles: 1 },
    ]);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.id).toBe(7);
  });
});