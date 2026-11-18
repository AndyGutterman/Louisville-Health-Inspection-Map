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

  it("reads the Learn and admin page links and ignores other pages", () => {
    expect(parseDeepLink("?page=learn").page).toBe("learn");
    expect(parseDeepLink("?page=admin").page).toBe("admin");
    expect(parseDeepLink("?page=pins").page).toBe("pins");
    expect(parseDeepLink("?page=privacy").page).toBe("privacy");
    expect(parseDeepLink("?page=settings").page).toBe(null);
    expect(parseDeepLink("?page=admin&x=1").rest).toBe("x=1");
  });

  it("is empty for a plain visit", () => {
    expect(parseDeepLink("")).toEqual({ eid: null, page: null, rest: "" });
  });
});
