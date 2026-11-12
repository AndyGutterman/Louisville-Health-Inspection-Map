import { describe, expect, it } from "vitest";
import {
  compact,
  featureSearchKey,
  looseRegex,
  matchesSearch,
  searchKey,
  searchTokens,
} from "./searchText.js";

const SPELLINGS = ["mcdonalds", "McDonald's", "Mc Donald's", "mc'donalds", "MC DONALD’S"];
const NAMES = ["MCDONALD'S #1234", "Mc Donalds", "McDonalds Restaurant", "MC'DONALDS"];

describe("compact", () => {
  it("keeps lowercase letters and digits only", () => {
    expect(compact("Mc Donald's #12")).toBe("mcdonalds12");
    expect(compact("A & W / Long John Silver's")).toBe("awlongjohnsilvers");
  });
  it("drops accents", () => expect(compact("Café Lou-Lou")).toBe("cafeloulou"));
  it("is empty for nothing", () => {
    expect(compact(undefined)).toBe("");
    expect(compact(null)).toBe("");
  });
});

describe("searchTokens", () => {
  it("splits on spaces and compacts each word", () => {
    expect(searchTokens("  Mc  Donald's ")).toEqual(["mc", "donalds"]);
    expect(searchTokens("mc'donalds")).toEqual(["mcdonalds"]);
  });
  it("drops words that are only punctuation", () => {
    expect(searchTokens("taco - bell")).toEqual(["taco", "bell"]);
  });
});

describe("matchesSearch", () => {
  it("finds McDonald's however either side spells it", () => {
    for (const name of NAMES) {
      for (const term of SPELLINGS)
        expect(matchesSearch(name, term), `${term} → ${name}`).toBe(true);
    }
  });
  it("needs every word, in any order", () => {
    const key = featureSearchKey({ name: "McDonald's", address: "4500 Dixie Hwy" });
    expect(matchesSearch(key, "dixie mcdonalds")).toBe(true);
    expect(matchesSearch(key, "mcdonalds preston")).toBe(false);
  });
  it("does not match a different name", () => {
    expect(matchesSearch("Donatos Pizza", "mcdonalds")).toBe(false);
  });
  it("matches everything for a blank term", () => expect(matchesSearch("x", " ")).toBe(true));
});

describe("searchKey", () => {
  it("keeps fields apart so a word can't run across two of them", () => {
    expect(searchKey("Taco", undefined, "Bell Ave")).toBe("taco bellave");
    expect(searchKey("Taco", "Bell Ave").includes("tacobell")).toBe(false);
  });
});

describe("looseRegex", () => {
  // Postgres ~* behaves like a JS case-insensitive RegExp for this pattern.
  const pg = (token) => new RegExp(looseRegex(token), "i");
  it("lets anything but letters and digits sit between the characters", () => {
    for (const name of NAMES) {
      for (const term of SPELLINGS) {
        for (const t of searchTokens(term)) expect(pg(t).test(name), `${t} → ${name}`).toBe(true);
      }
    }
  });
  it("still needs the characters in order, with no letters between", () => {
    expect(pg("mcdonalds").test("Donatos Pizza")).toBe(false);
    expect(pg("mcdonalds").test("McDowell Donalds")).toBe(false);
  });
});
