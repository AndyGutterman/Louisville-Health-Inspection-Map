import { describe, expect, it } from "vitest";
import {
  MAX_STAMPED_AGE,
  countyCacheKey,
  lastDataRefresh,
  readMapCache,
  writeMapCache,
} from "./mapCache.js";

// A Storage look-alike (getItem, setItem, removeItem, key, length).
function memoryStorage(initial = {}, { full = false } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (full) throw new DOMException("full", "QuotaExceededError");
      m.set(k, String(v));
    },
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

const VERSION = "lfs_geodata_v8";
const KEY = countyCacheKey(VERSION, "jefferson");
const HOUR = 60 * 60 * 1000;
const REFRESH = 11; // the daily data load, 11:00 UTC
const at = (iso) => Date.parse(iso);
const pins = [{ type: "Feature", properties: { establishment_id: "1" } }];
const read = (s, now) => readMapCache(s, { key: KEY, refreshUtcHour: REFRESH, now });

describe("lastDataRefresh", () => {
  it("is today's load once it has happened, yesterday's before", () => {
    expect(lastDataRefresh(at("2026-11-12T15:00:00Z"), REFRESH)).toBe(at("2026-11-12T11:00:00Z"));
    expect(lastDataRefresh(at("2026-11-12T11:00:00Z"), REFRESH)).toBe(at("2026-11-12T11:00:00Z"));
    expect(lastDataRefresh(at("2026-11-12T10:59:00Z"), REFRESH)).toBe(at("2026-11-11T11:00:00Z"));
    expect(lastDataRefresh(at("2026-01-01T03:00:00Z"), REFRESH)).toBe(at("2025-12-31T11:00:00Z"));
  });
});

describe("map cache", () => {
  it("gives back what was saved, until the next daily data load", () => {
    const s = memoryStorage();
    expect(
      writeMapCache(s, pins, { key: KEY, version: VERSION, now: at("2026-11-12T12:00Z") }),
    ).toBe(true);
    expect(read(s, at("2026-11-12T23:00Z"))).toEqual(pins);
    expect(read(s, at("2026-11-13T10:59Z"))).toEqual(pins); // 23 hours on, same data
  });

  it("is empty once the data has been loaded again", () => {
    const s = memoryStorage();
    writeMapCache(s, pins, { key: KEY, version: VERSION, now: at("2026-11-12T12:00Z") });
    expect(read(s, at("2026-11-13T11:00Z"))).toBeNull();
    // Saved just before a load: stale minutes later.
    writeMapCache(s, pins, { key: KEY, version: VERSION, now: at("2026-11-12T10:55Z") });
    expect(read(s, at("2026-11-12T11:05Z"))).toBeNull();
  });

  it("ignores a save from the future (a clock that jumped back)", () => {
    const s = memoryStorage();
    writeMapCache(s, pins, { key: KEY, version: VERSION, now: at("2026-11-12T20:00Z") });
    expect(read(s, at("2026-11-12T12:00Z"))).toBeNull();
  });

  it("is empty when nothing, junk or the wrong shape is stored", () => {
    const now = 20 * HOUR;
    expect(read(memoryStorage(), now)).toBeNull();
    expect(read(memoryStorage({ [KEY]: "{not json" }), now)).toBeNull();
    expect(read(memoryStorage({ [KEY]: `{"ts":${now},"data":{}}` }), now)).toBeNull();
  });

  it("treats missing or blocked storage as no cache", () => {
    expect(readMapCache(null, { key: KEY, refreshUtcHour: REFRESH })).toBeNull();
    expect(writeMapCache(null, pins, { key: KEY })).toBe(false);
  });

  it("reports a full storage instead of throwing", () => {
    expect(writeMapCache(memoryStorage({}, { full: true }), pins, { key: KEY })).toBe(false);
  });

  it("keeps each county apart: saving one leaves the others", () => {
    const s = memoryStorage();
    const bullitt = countyCacheKey(VERSION, "bullitt");
    const other = [{ type: "Feature", properties: { establishment_id: "bullitt-1" } }];
    const now = at("2026-11-12T12:00Z");
    writeMapCache(s, pins, { key: KEY, version: VERSION, now });
    writeMapCache(s, other, { key: bullitt, version: VERSION, now });
    expect(read(s, now)).toEqual(pins);
    expect(readMapCache(s, { key: bullitt, refreshUtcHour: REFRESH, now })).toEqual(other);
  });

  it("clears older versions of the cache, and leaves everything else alone", () => {
    const s = memoryStorage({
      lfs_geodata_v6: "old",
      lfs_geodata_v7: "old",
      "lfs_geodata_v7:bullitt": "old",
      [countyCacheKey(VERSION, "oldham")]: "current",
      lfs_counties: '["jefferson"]',
      "sb-auth-token": "x",
    });
    writeMapCache(s, pins, { key: KEY, version: VERSION, now: 0 });
    expect(s.keys().sort()).toEqual(
      [countyCacheKey(VERSION, "oldham"), "lfs_counties", KEY, "sb-auth-token"].sort(),
    );
  });
});

describe("map cache with load stamps (data_loads)", () => {
  const S1 = "2026-11-20T14:31:02+00:00";
  const S2 = "2026-11-21T14:29:40+00:00";
  const save = (s, stamp, now) =>
    writeMapCache(s, pins, { key: KEY, version: VERSION, stamp, now });
  const readAt = (s, stamp, now) =>
    readMapCache(s, { key: KEY, refreshUtcHour: REFRESH, stamp, now });

  it("stays good past the daily refresh hour while the county hasn't loaded again", () => {
    const s = memoryStorage();
    save(s, S1, at("2026-11-20T15:00Z"));
    expect(readAt(s, S1, at("2026-11-21T12:00Z"))).toEqual(pins); // past 11:00, same stamp
  });

  it("is empty as soon as the county has loaded again", () => {
    const s = memoryStorage();
    save(s, S1, at("2026-11-20T15:00Z"));
    expect(readAt(s, S2, at("2026-11-20T15:05Z"))).toBeNull(); // minutes later, new stamp
  });

  it(`is read again after ${MAX_STAMPED_AGE / (24 * HOUR)} days even with the same stamp`, () => {
    const s = memoryStorage();
    save(s, S1, at("2026-11-20T15:00Z"));
    expect(readAt(s, S1, at("2026-11-23T14:59Z"))).toEqual(pins);
    expect(readAt(s, S1, at("2026-11-23T15:00Z"))).toBeNull();
  });

  it("keeps the daily rule when the stamp is unknown on either side", () => {
    const s = memoryStorage();
    save(s, null, at("2026-11-20T12:00Z")); // saved before the table existed
    expect(readAt(s, S1, at("2026-11-20T23:00Z"))).toEqual(pins);
    expect(readAt(s, S1, at("2026-11-21T11:00Z"))).toBeNull();
    save(s, S1, at("2026-11-20T12:00Z")); // the stamp's read failed this visit
    expect(readAt(s, null, at("2026-11-20T23:00Z"))).toEqual(pins);
    expect(readAt(s, null, at("2026-11-21T11:00Z"))).toBeNull();
  });

  it("saves the stamp with the pins", () => {
    const s = memoryStorage();
    save(s, S1, at("2026-11-20T15:00Z"));
    expect(JSON.parse(s.getItem(KEY)).stamp).toBe(S1);
  });
});
