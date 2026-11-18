import { describe, expect, it } from "vitest";
import {
  LANGUAGES,
  LANGUAGE_KEY,
  localeOf,
  pickLanguage,
  saveLanguage,
  translate,
} from "./i18n.js";
import { STRINGS } from "./strings.js";

const memory = (start = {}) => {
  const data = { ...start };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => (data[k] = String(v)),
    data,
  };
};
const blocked = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
};

describe("pickLanguage", () => {
  it("keeps the visitor's saved choice", () => {
    expect(pickLanguage(memory({ [LANGUAGE_KEY]: "es" }), ["en-US"])).toBe("es");
  });

  it("otherwise follows the browser, matching on the language part", () => {
    expect(pickLanguage(memory(), ["es-MX", "en"])).toBe("es");
    expect(pickLanguage(memory(), ["fr-FR", "es-419"])).toBe("es");
  });

  it("falls back to English for languages the site doesn't have, or junk", () => {
    expect(pickLanguage(memory(), ["fr-FR", "de"])).toBe("en");
    expect(pickLanguage(memory({ [LANGUAGE_KEY]: "xx" }), [])).toBe("en");
    expect(pickLanguage(null, undefined)).toBe("en");
  });

  it("copes with blocked storage", () => {
    expect(pickLanguage(blocked, ["es"])).toBe("es");
    expect(() => saveLanguage(blocked, "es")).not.toThrow();
  });
});

describe("saveLanguage", () => {
  it("stores a language the site has, and nothing else", () => {
    const s = memory();
    saveLanguage(s, "es");
    expect(s.data[LANGUAGE_KEY]).toBe("es");
    saveLanguage(s, "xx");
    expect(s.data[LANGUAGE_KEY]).toBe("es");
  });
});

describe("translate", () => {
  it("looks up a word and fills its placeholders", () => {
    expect(translate("es", "header.search")).toBe("Buscar en el mapa");
    expect(translate("en", "header.searchScope", { on: 3, of: 8 })).toBe(
      "Searching 3 of 8 place types",
    );
  });

  it("picks the plural form from n", () => {
    expect(translate("en", "violations", { n: 1 })).toBe("1 violation");
    expect(translate("en", "violations", { n: 3 })).toBe("3 violations");
    expect(translate("es", "violations", { n: 1 })).toBe("1 infracción");
    expect(translate("es", "violations", { n: 0 })).toBe("0 infracciones");
  });

  it("falls back to English, then to the key, so nothing breaks", () => {
    expect(translate("xx", "header.search")).toBe("Search map");
    expect(translate("es", "no.such.key")).toBe("no.such.key");
  });

  it("leaves a placeholder it wasn't given", () => {
    expect(translate("en", "popup.score", {})).toBe("Score: {score}");
  });
});

describe("the dictionaries", () => {
  const placeholders = (entry) =>
    [...JSON.stringify(entry).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  for (const { code } of LANGUAGES) {
    it(`${code} has every key English has, and no others`, () => {
      expect(Object.keys(STRINGS[code]).sort()).toEqual(Object.keys(STRINGS.en).sort());
    });

    it(`${code} keeps every word's placeholders and plural forms`, () => {
      for (const [key, entry] of Object.entries(STRINGS.en)) {
        const mine = STRINGS[code][key];
        expect(placeholders(mine), key).toEqual(placeholders(entry));
        expect(typeof mine, key).toBe(typeof entry);
        if (typeof entry === "object")
          expect(Object.keys(mine).sort(), key).toEqual(["one", "other"]);
      }
    });
  }

  it("gives each language a locale for dates", () => {
    expect(localeOf("es")).toBe("es-US");
    expect(localeOf("xx")).toBe("en-US");
  });
});
