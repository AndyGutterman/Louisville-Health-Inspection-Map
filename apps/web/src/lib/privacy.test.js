import { describe, expect, it } from "vitest";
import { PRIVACY_PATH, PRIVACY_UPDATED, privacyUpdatedText } from "./privacy.js";

describe("privacy", () => {
  it("keeps the update day as an ISO date", () => {
    expect(PRIVACY_UPDATED).toBe("2026-11-19");
  });
  it("writes the date in English", () => {
    expect(privacyUpdatedText("en-US")).toBe("November 19, 2026");
  });
  it("writes the date in Spanish", () => {
    expect(privacyUpdatedText("es-US")).toMatch(/19 de noviembre de 2026/);
  });
  it("links to the page", () => {
    expect(PRIVACY_PATH).toBe("/?page=privacy");
  });
});
