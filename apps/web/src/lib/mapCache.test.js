import { describe, expect, it } from "vitest";
import { readMapCache, writeMapCache } from "./mapCache.js";

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

const KEY = "lfs_geodata_v7";
const HOUR = 60 * 60 * 1000;
const TTL = 6 * HOUR;
const pins = [{ type: "Feature", properties: { establishment_id: "1" } }];

describe("map cache", () => {
  it("gives back what was saved, while it's fresh", () => {
    const s = memoryStorage();
    expect(writeMapCache(s, pins, { key: KEY, now: 0 })).toBe(true);
    expect(readMapCache(s, { key: KEY, ttl: TTL, now: 5 * HOUR })).toEqual(pins);
  });

  it("is empty after the time limit", () => {
    const s = memoryStorage();
    writeMapCache(s, pins, { key: KEY, now: 0 });
    expect(readMapCache(s, { key: KEY, ttl: TTL, now: 6 * HOUR })).toBeNull();
  });

  it("ignores a save from the future (a clock that jumped back)", () => {
    const s = memoryStorage();
    writeMapCache(s, pins, { key: KEY, now: 10 * HOUR });
    expect(readMapCache(s, { key: KEY, ttl: TTL, now: 0 })).toBeNull();
  });

  it("is empty when nothing, junk or the wrong shape is stored", () => {
    const opts = { key: KEY, ttl: TTL, now: 0 };
    expect(readMapCache(memoryStorage(), opts)).toBeNull();
    expect(readMapCache(memoryStorage({ [KEY]: "{not json" }), opts)).toBeNull();
    expect(readMapCache(memoryStorage({ [KEY]: '{"ts":0,"data":{}}' }), opts)).toBeNull();
  });

  it("treats missing or blocked storage as no cache", () => {
    expect(readMapCache(null, { key: KEY, ttl: TTL })).toBeNull();
    expect(writeMapCache(null, pins, { key: KEY })).toBe(false);
  });

  it("reports a full storage instead of throwing", () => {
    expect(writeMapCache(memoryStorage({}, { full: true }), pins, { key: KEY })).toBe(false);
  });

  it("clears older versions of the cache, and leaves everything else alone", () => {
    const s = memoryStorage({
      lfs_geodata_v5: "old",
      lfs_geodata_v6: "old",
      lfs_digest_optin: "1",
      "sb-auth-token": "x",
    });
    writeMapCache(s, pins, { key: KEY, now: 0 });
    expect(s.keys().sort()).toEqual(["lfs_digest_optin", KEY, "sb-auth-token"].sort());
  });
});
