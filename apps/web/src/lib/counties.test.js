import { describe, expect, it } from "vitest";
import {
  COUNTY_CHOICE_KEY,
  countyStatusText,
  defaultCounties,
  readCountyChoice,
  tableCounties,
  toggleCounty,
  writeCountyChoice,
} from "./counties.js";

const REGIONS = [
  { id: "jefferson", has: { table: true } },
  { id: "bullitt", has: { table: true } },
  { id: "oldham", has: { table: false } },
];

const storageWith = (value) => ({
  getItem: (k) => (k === COUNTY_CHOICE_KEY ? value : null),
});

describe("county choice", () => {
  it("starts with Jefferson only", () => {
    expect(defaultCounties(REGIONS)).toEqual(["jefferson"]);
    expect(readCountyChoice(storageWith(null), REGIONS)).toEqual(["jefferson"]);
  });

  it("reads back a saved choice, in the site's county order", () => {
    expect(readCountyChoice(storageWith('["oldham","jefferson"]'), REGIONS)).toEqual([
      "jefferson",
      "oldham",
    ]);
  });

  it("drops counties the site no longer has, and repeats", () => {
    expect(readCountyChoice(storageWith('["bullitt","shelby","bullitt"]'), REGIONS)).toEqual([
      "bullitt",
    ]);
  });

  it("falls back to the default for junk, an empty list or blocked storage", () => {
    expect(readCountyChoice(storageWith("{not json"), REGIONS)).toEqual(["jefferson"]);
    expect(readCountyChoice(storageWith("[]"), REGIONS)).toEqual(["jefferson"]);
    expect(readCountyChoice(storageWith('"bullitt"'), REGIONS)).toEqual(["jefferson"]);
    expect(readCountyChoice(null, REGIONS)).toEqual(["jefferson"]);
  });

  it("saves the choice, and reports storage that can't be written", () => {
    const saved = {};
    expect(writeCountyChoice({ setItem: (k, v) => (saved[k] = v) }, ["bullitt"])).toBe(true);
    expect(saved[COUNTY_CHOICE_KEY]).toBe('["bullitt"]');
    expect(writeCountyChoice(null, ["bullitt"])).toBe(false);
  });

  it("switches one county on or off", () => {
    expect(toggleCounty(["jefferson"], "oldham", true, REGIONS)).toEqual(["jefferson", "oldham"]);
    expect(toggleCounty(["jefferson", "oldham"], "jefferson", false, REGIONS)).toEqual(["oldham"]);
    expect(toggleCounty(["jefferson"], "jefferson", true, REGIONS)).toEqual(["jefferson"]);
    expect(toggleCounty(["jefferson"], "jefferson", false, REGIONS)).toEqual([]);
  });

  it("lists only the switched-on counties Table View can show", () => {
    const ids = (list) => list.map((r) => r.id);
    expect(ids(tableCounties(["jefferson", "bullitt", "oldham"], REGIONS))).toEqual([
      "jefferson",
      "bullitt",
    ]);
    expect(ids(tableCounties(["oldham"], REGIONS))).toEqual([]);
  });
});

describe("countyStatusText", () => {
  it("says what a county is doing", () => {
    expect(countyStatusText({ shown: false })).toBe("Not loaded");
    expect(countyStatusText({ shown: true, state: "loading" })).toBe("Loading…");
    expect(countyStatusText({ shown: true, state: "failed" })).toBe("Couldn't load. Tap to retry");
    expect(countyStatusText({ shown: true, state: "ready", places: 8330 })).toBe("8,330 places");
    expect(countyStatusText({ shown: true, state: "ready", places: 1 })).toBe("1 place");
    expect(countyStatusText({ shown: false, state: "ready", places: 250 })).toBe(
      "250 places, hidden",
    );
  });
});
