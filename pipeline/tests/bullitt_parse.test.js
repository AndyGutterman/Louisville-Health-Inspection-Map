/**
 * tests/bullitt_parse.test.js — reading the Bullitt County Health Department's sheet.
 * Rows below are copied from the real sheet (November 2026).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COLUMNS,
  contentHash,
  establishmentId,
  normalizeCity,
  parseCsv,
  parseScore,
  parseSheet,
  parseUsDate,
  splitViolations,
} from "../regions/bullitt/parse.js";

const HEADER = COLUMNS.map((c) => `"${c}"`).join(",");
const csv = (...lines) => [HEADER, ...lines].join("\n") + "\n";

describe("parseCsv", () => {
  it("keeps commas, quotes and newlines inside quoted fields", () => {
    assert.deepEqual(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\nx,y,z,w\n'), [
      ["a", "b, c", 'say "hi"', "two\nlines"],
      ["x", "y", "z", "w"],
    ]);
  });

  it("handles a last line without a newline", () => {
    assert.deepEqual(parseCsv("a,b\nc,d"), [
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("normalizeCity", () => {
  it("fixes the misspellings in the sheet", () => {
    for (const raw of ["SHEPHERDSVILLE", "SHEPHERDSVLLE", "Shepherdsvile"]) {
      assert.equal(normalizeCity(raw), "SHEPHERDSVILLE");
    }
  });
  it("spells out Mt. and Jct.", () => {
    assert.equal(normalizeCity("MT. WASHINGTON"), "MOUNT WASHINGTON");
    assert.equal(normalizeCity("LEBANON JCT."), "LEBANON JUNCTION");
  });
  it("keeps a town it doesn't know, uppercased", () =>
    assert.equal(normalizeCity(" Coxs  Creek "), "COXS CREEK"));
});

describe("splitViolations", () => {
  it("keeps form items that contain a semicolon whole", () => {
    assert.deepEqual(
      splitViolations(
        "PROPER COLD HOLDING TEMPERATURES; Hot and cold water available; adequate pressure; " +
          "plumbing maintained; PLUMBING INSTALLED; PROPER BACKFLOW DEVICES",
      ),
      [
        "PROPER COLD HOLDING TEMPERATURES",
        "Hot and cold water available; adequate pressure; plumbing maintained",
        "PLUMBING INSTALLED; PROPER BACKFLOW DEVICES",
      ],
    );
  });

  it("splits separate uppercase items", () => {
    assert.deepEqual(
      splitViolations("PROPER HOT HOLDING TEMPERATURES; PROPER DATE MARKING AND DISPOSITION"),
      ["PROPER HOT HOLDING TEMPERATURES", "PROPER DATE MARKING AND DISPOSITION"],
    );
  });

  it("tidies spacing and drops empty pieces", () => {
    assert.deepEqual(splitViolations("Ware washing facilities:  installed, maintained; ;\n"), [
      "Ware washing facilities: installed, maintained",
    ]);
  });

  it("returns nothing for an empty cell", () => assert.deepEqual(splitViolations(""), []));
});

describe("parseScore and parseUsDate", () => {
  it("reads scores", () => {
    assert.equal(parseScore("94"), 94);
    assert.equal(parseScore(" 97.5 "), 97.5);
    assert.equal(parseScore(""), null);
  });

  it("reports an unreadable score", () => {
    const warnings = [];
    assert.equal(
      parseScore("N/A", (w) => warnings.push(w)),
      null,
    );
    assert.equal(warnings.length, 1);
  });

  it("reads US dates", () => {
    assert.equal(parseUsDate("9/14/2026"), "2026-09-14");
    assert.equal(parseUsDate("12/1/25"), "2025-12-01");
    assert.equal(parseUsDate(""), null);
  });

  it("rejects impossible dates", () => {
    const warnings = [];
    assert.equal(
      parseUsDate("2/30/2026", (w) => warnings.push(w)),
      null,
    );
    assert.equal(
      parseUsDate("Sept 14", (w) => warnings.push(w)),
      null,
    );
    assert.equal(warnings.length, 2);
  });
});

describe("establishmentId", () => {
  it("is stable and ignores case and spacing", () => {
    const id = establishmentId("AFC SUSHI @ KROGER  #758 L", "234 EASTBROOKE PKWY");
    assert.match(id, /^bullitt-[0-9a-f]{12}$/);
    assert.equal(establishmentId("afc sushi @ kroger #758 L", " 234 Eastbrooke Pkwy"), id);
  });

  it("differs for two places at one address", () =>
    assert.notEqual(
      establishmentId("A", "282 ALFRED LANE"),
      establishmentId("B", "282 ALFRED LANE"),
    ));
});

describe("contentHash", () => {
  it("changes when the score or the violations change", () => {
    const base = { kind: "routine", inspection_date: null, score: 94, violations: ["X"] };
    assert.equal(contentHash(base), contentHash({ ...base }));
    assert.notEqual(contentHash(base), contentHash({ ...base, score: 95 }));
    assert.notEqual(contentHash(base), contentHash({ ...base, violations: [] }));
    assert.notEqual(contentHash(base), contentHash({ ...base, kind: "follow_up" }));
  });
});

describe("parseSheet", () => {
  it("reads a row with a follow-up", () => {
    const { establishments, warnings } = parseSheet(
      csv(
        '"AFC SUSHI @ KROGER #728L","185 ADAM SHEPHERD PARKWAY","SHEPHERDSVILLE","94",' +
          '"PROPER COLD HOLDING TEMPERATURES; Hot and cold water available; adequate pressure; plumbing maintained",' +
          '"9/14/2026","100",""',
      ),
    );
    assert.deepEqual(warnings, []);
    assert.equal(establishments.length, 1);
    const [e] = establishments;
    assert.equal(e.name, "AFC SUSHI @ KROGER #728L");
    assert.equal(e.city, "SHEPHERDSVILLE");
    assert.equal(e.routine.score, 94);
    assert.equal(e.routine.inspection_date, null);
    assert.equal(e.routine.violations.length, 2);
    assert.deepEqual(
      { date: e.follow_up.inspection_date, score: e.follow_up.score, v: e.follow_up.violations },
      { date: "2026-09-14", score: 100, v: [] },
    );
  });

  it("gives a place that hasn't been inspected no inspections", () => {
    const { establishments } = parseSheet(
      csv('"7 BREW COFFEE","149 HIGH POINTE CT","MOUNT WASHINGTON","","","","",""'),
    );
    assert.equal(establishments[0].routine, null);
    assert.equal(establishments[0].follow_up, null);
  });

  it("keeps the first of two identical rows and says so", () => {
    const row = '"ARBY\'S #5617","1208 HWY 44 EAST","SHEPHERDSVILLE","99","","","",""';
    const { establishments, warnings } = parseSheet(csv(row, row));
    assert.equal(establishments.length, 1);
    assert.equal(warnings.length, 1);
  });

  it("skips blank rows and a byte-order mark", () => {
    const { establishments } = parseSheet(
      "﻿" +
        csv(
          '"AMORE MIO","435 N BARDSTOWN RD STE 2 A","MOUNT WASHINGTON","100","","","",""',
          ",,,,,,,",
        ),
    );
    assert.equal(establishments.length, 1);
  });

  it("stops when the columns change", () => {
    assert.throws(
      () => parseSheet('"Name","Address","City","Score"\n"A","B","C","90"\n'),
      /Unexpected columns/,
    );
  });
});
