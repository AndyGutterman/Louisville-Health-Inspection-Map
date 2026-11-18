import { describe, it, expect } from "vitest";
import {
  isNewAccount,
  isSubscribed,
  markOffered,
  offeredLanguage,
  rememberDigestOptIn,
  rememberSignupLanguage,
  shouldOfferLanguage,
  takeDigestOptIn,
  takeSignupLanguage,
} from "./digest.js";

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

describe("the email's language", () => {
  const store = () => {
    const d = {};
    return {
      getItem: (k) => d[k] ?? null,
      setItem: (k, v) => (d[k] = v),
      removeItem: (k) => delete d[k],
    };
  };

  it("remembers the sign-up language once", () => {
    const s = store();
    rememberSignupLanguage("es", s);
    expect(takeSignupLanguage(s)).toBe("es");
    expect(takeSignupLanguage(s)).toBeNull();
  });

  it("takes only a brand-new account for the sign-up language", () => {
    const now = Date.parse("2026-11-19T12:00:00Z");
    expect(isNewAccount({ created_at: "2026-11-19T11:55:00Z" }, now)).toBe(true);
    expect(isNewAccount({ created_at: "2026-11-01T11:55:00Z" }, now)).toBe(false);
    expect(isNewAccount({}, now)).toBe(false);
    expect(isNewAccount(null, now)).toBe(false);
  });

  const base = { subscribed: true, digestLanguage: "en", siteLanguage: "es" };
  it("offers only to a subscriber whose email is in another language", () => {
    expect(shouldOfferLanguage(base)).toBe(true);
    expect(shouldOfferLanguage({ ...base, subscribed: false })).toBe(false);
    expect(shouldOfferLanguage({ ...base, digestLanguage: "es" })).toBe(false);
    expect(shouldOfferLanguage({ ...base, digestLanguage: null })).toBe(false);
  });

  it("asks once per language after a switch, but the Saved panel always shows it", () => {
    expect(shouldOfferLanguage({ ...base, offeredFor: "es" })).toBe(false);
    expect(shouldOfferLanguage({ ...base, offeredFor: "en" })).toBe(true);
    expect(shouldOfferLanguage({ ...base, offeredFor: "es", always: true })).toBe(true);
  });

  it("remembers what it offered", () => {
    const s = store();
    expect(offeredLanguage(s)).toBeNull();
    markOffered("es", s);
    expect(offeredLanguage(s)).toBe("es");
  });
});
