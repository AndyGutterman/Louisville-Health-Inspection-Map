import { describe, expect, it } from "vitest";
import {
  confirmsCount,
  countsText,
  errorText,
  louisvilleToday,
  louisvilleToIso,
  nextTab,
  previewDoc,
  queuedNotice,
  scheduleProblem,
  whenText,
} from "./adminEmail.js";

describe("a scheduled time", () => {
  it("reads a Louisville wall-clock time as its instant (EST in November, 5 hours ahead)", () => {
    expect(louisvilleToIso("2026-11-20T14:30")).toBe("2026-11-20T19:30:00.000Z");
  });
  it("is right on the day daylight saving starts (2 am becomes 3 am, 05:00 is already EDT)", () => {
    // 2027-03-14: 05:00 Louisville is 09:00 UTC (EDT, 4 hours ahead), not 10:00.
    expect(louisvilleToIso("2027-03-14T05:00")).toBe("2027-03-14T09:00:00.000Z");
  });
  it("gives null for anything that isn't a date and time", () => {
    expect(louisvilleToIso("")).toBeNull();
    expect(louisvilleToIso("tomorrow")).toBeNull();
  });
  it("must be in the future, and at most 30 days ahead", () => {
    const now = Date.parse("2026-11-20T12:00:00Z");
    expect(scheduleProblem(null, now)).toMatch(/Pick a date/);
    expect(scheduleProblem("2026-11-20T11:00:00Z", now)).toMatch(/future/);
    expect(scheduleProblem("2026-11-21T12:00:00Z", now)).toBeNull();
    expect(scheduleProblem("2026-12-25T12:00:00Z", now)).toMatch(/30 days/);
  });
});

describe("nextTab", () => {
  const names = ["digest", "write", "sent"];
  it("moves right and left, wrapping at both ends", () => {
    expect(nextTab(names, "digest", "ArrowRight")).toBe("write");
    expect(nextTab(names, "sent", "ArrowRight")).toBe("digest");
    expect(nextTab(names, "digest", "ArrowLeft")).toBe("sent");
  });
  it("Home and End go to the first and last tab", () => {
    expect(nextTab(names, "write", "Home")).toBe("digest");
    expect(nextTab(names, "write", "End")).toBe("sent");
  });
  it("returns null for any other key, or an empty list", () => {
    expect(nextTab(names, "write", "Enter")).toBeNull();
    expect(nextTab([], "write", "ArrowRight")).toBeNull();
  });
});

describe("louisvilleToday", () => {
  it("is Louisville's date, not UTC's", () => {
    // 02:30 UTC on the 11th is still the evening of the 10th in Louisville.
    expect(louisvilleToday(new Date("2026-11-11T02:30:00Z"))).toBe("2026-11-10");
    expect(louisvilleToday(new Date("2026-11-11T15:00:00Z"))).toBe("2026-11-11");
  });
});

describe("previewDoc", () => {
  it("makes the email's links open in a new tab", () => {
    expect(previewDoc("<html><head><title>x</title></head><body></body></html>")).toBe(
      '<html><head><base target="_blank"><title>x</title></head><body></body></html>',
    );
    expect(previewDoc(null)).toBe("");
  });
});

describe("confirmsCount", () => {
  it("wants exactly the number of subscribers", () => {
    expect(confirmsCount("12", 12)).toBe(true);
    expect(confirmsCount(" 12 ", 12)).toBe(true);
    expect(confirmsCount("1", 12)).toBe(false);
    expect(confirmsCount("", 12)).toBe(false);
    expect(confirmsCount("twelve", 12)).toBe(false);
  });

  it("never confirms an email to nobody", () => {
    expect(confirmsCount("0", 0)).toBe(false);
  });
});

describe("errorText", () => {
  it("says to run the migration when the database lacks the functions", () => {
    expect(errorText({ code: "PGRST202", message: "Could not find the function" })).toMatch(
      /Run supabase\/migrations\/20261125000000_email_admin\.sql/,
    );
  });

  it("says so when the account isn't an admin", () => {
    expect(errorText({ code: "42501", message: "Admins only" })).toBe(
      "This account isn't an admin.",
    );
  });

  it("passes the database's own words on otherwise", () => {
    expect(errorText({ code: "P0001", message: "Add a subject" })).toBe("Add a subject");
    expect(errorText(new Error("Failed to fetch"))).toBe("Failed to fetch");
  });
});

describe("whenText", () => {
  const now = Date.parse("2026-11-10T18:00:00Z");
  const ago = (minutes) => new Date(now - minutes * 60000).toISOString();

  it("counts minutes, then hours, then gives the date", () => {
    expect(whenText(ago(0.2), now)).toBe("just now");
    expect(whenText(ago(5), now)).toBe("5 min ago");
    expect(whenText(ago(185), now)).toBe("3 hr ago");
    expect(whenText("2026-11-03T12:02:00Z", now)).toBe("Nov 3, 7:02 AM"); // Louisville time
    expect(whenText(null, now)).toBe("");
  });
});

describe("countsText", () => {
  it("says how many went and how many didn't", () => {
    expect(countsText({ sent_count: 12, failed_count: 0, recipient_count: 12 })).toBe("Sent 12");
    expect(countsText({ sent_count: 11, failed_count: 1, recipient_count: 12 })).toBe(
      "Sent 11 of 12 · 1 failed",
    );
    expect(countsText({ sent_count: 0, failed_count: 0, recipient_count: 3 })).toBe("");
  });
});

describe("queuedNotice", () => {
  it("is good news when the sender started", () => {
    expect(queuedNotice({ started: true })).toMatchObject({ ok: true });
  });

  it("points at the ALLOWED_ORIGIN secret when the browser couldn't reach the function", () => {
    const { ok, text } = queuedNotice({ started: false, reason: "unreachable" });
    expect(ok).toBe(false);
    expect(text).toMatch(/ALLOWED_ORIGIN/);
    expect(text).toMatch(/no slash at the end/);
  });

  it("says why when it didn't, in plain words", () => {
    expect(queuedNotice({ started: false, reason: "no_token" }).text).toMatch(
      /didn't start \(the GitHub token isn't set up\)/,
    );
    expect(queuedNotice({ started: false, reason: "GitHub said 404" }).text).toMatch(
      /\(GitHub said 404\)/,
    );
    expect(queuedNotice({ started: false }).ok).toBe(false);
  });
});
