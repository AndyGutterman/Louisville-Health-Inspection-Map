import { describe, it, expect, vi } from "vitest";
import { inBounds, buildAutocompleteUrl, parseSuggestions, searchAddresses } from "./geocode.js";

const place = (over = {}) => ({
  properties: {
    formatted: "1075 Bardstown Rd, Louisville, KY 40204",
    address_line1: "1075 Bardstown Rd",
    address_line2: "Louisville, KY 40204",
    lat: 38.2327,
    lon: -85.7121,
    ...over,
  },
});

describe("inBounds", () => {
  it("accepts downtown Louisville", () => {
    expect(inBounds(38.2527, -85.7585)).toBe(true);
  });

  it("rejects places outside Louisville Metro", () => {
    expect(inBounds(40.7128, -74.006)).toBe(false); // New York
    expect(inBounds(36.1627, -86.7816)).toBe(false); // Nashville
  });
});

describe("buildAutocompleteUrl", () => {
  const url = buildAutocompleteUrl("1075 bardstown", "KEY123");

  it("sends the query, the key and a result limit", () => {
    expect(url.searchParams.get("text")).toBe("1075 bardstown");
    expect(url.searchParams.get("apiKey")).toBe("KEY123");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("restricts results to Louisville Metro and biases toward downtown", () => {
    expect(url.searchParams.get("filter")).toBe("rect:-86.15,37.85,-85.3,38.5");
    expect(url.searchParams.get("bias")).toBe("proximity:-85.7585,38.2527");
  });
});

describe("parseSuggestions", () => {
  it("maps a result into what the picker shows", () => {
    const { results, upstream } = parseSuggestions([place()]);
    expect(upstream).toBe(1);
    expect(results).toEqual([
      {
        address: "1075 Bardstown Rd, Louisville, KY 40204",
        primary: "1075 Bardstown Rd",
        secondary: "Louisville, KY 40204",
        lat: 38.2327,
        lon: -85.7121,
      },
    ]);
  });

  it("falls back to name, then the full address, for the primary line", () => {
    const named = parseSuggestions([place({ address_line1: undefined, name: "Highlands Tap" })]);
    expect(named.results[0].primary).toBe("Highlands Tap");
    const bare = parseSuggestions([place({ address_line1: undefined })]);
    expect(bare.results[0].primary).toBe("1075 Bardstown Rd, Louisville, KY 40204");
  });

  it("drops results without coordinates or outside the bounds, but still counts them upstream", () => {
    const { results, upstream } = parseSuggestions([
      place(),
      place({ lat: undefined }),
      place({ lat: 40.7128, lon: -74.006 }),
    ]);
    expect(results).toHaveLength(1);
    expect(upstream).toBe(3);
  });
});

describe("searchAddresses", () => {
  const respond = (body, ok = true, status = 200) =>
    vi.fn().mockResolvedValue({ ok, status, json: async () => body });

  it("fetches and parses suggestions", async () => {
    const fetchFn = respond({ features: [place()] });
    const signal = new AbortController().signal;

    const { results } = await searchAddresses("1075 bard", { key: "K", signal, fetchFn });

    expect(results).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toContain("apiKey=K");
    expect(fetchFn.mock.calls[0][1]).toEqual({ signal });
  });

  it("treats a missing features list as no results", async () => {
    const out = await searchAddresses("x", { key: "K", fetchFn: respond({}) });
    expect(out).toEqual({ results: [], upstream: 0 });
  });

  it("throws an error tagged 'error' when the service responds with a failure", async () => {
    const fetchFn = respond({}, false, 429);
    await expect(searchAddresses("x", { key: "K", fetchFn })).rejects.toMatchObject({
      code: "error",
      message: "Geoapify 429",
    });
  });
});
