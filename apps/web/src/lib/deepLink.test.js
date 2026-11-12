import { describe, it, expect } from "vitest";
import { parseDeepLink } from "./deepLink.js";

describe("parseDeepLink", () => {
  it("reads a place link and leaves the rest of the query", () => {
    expect(parseDeepLink("?eid=bullitt-abc&bust=1")).toEqual({
      eid: "bullitt-abc",
      page: null,
      rest: "bust=1",
    });
  });

  it("reads the Learn page link and ignores other pages", () => {
    expect(parseDeepLink("?page=learn").page).toBe("learn");
    expect(parseDeepLink("?page=admin").page).toBe(null);
  });

  it("is empty for a plain visit", () => {
    expect(parseDeepLink("")).toEqual({ eid: null, page: null, rest: "" });
  });
});
