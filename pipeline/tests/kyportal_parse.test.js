/**
 * tests/kyportal_parse.test.js — reading a county's page from Kentucky's inspection
 * portal. fixtures/kyportal_oldham.html holds real rows (Oldham County, November 2026).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { establishmentId } from "../lib/countyRows.js";
import { COUNTIES, countyById, idPrefix } from "../regions/kyportal/counties.js";
import {
  COLUMNS,
  parsePortalPage,
  parseScoreCell,
  parseScoreGrade,
} from "../regions/kyportal/parse.js";
import { countyCounts, newestInspections } from "../regions/kyportal/summary.js";

const PAGE = readFileSync(new URL("./fixtures/kyportal_oldham.html", import.meta.url), "utf8");
const parse = (html = PAGE) => parsePortalPage(html, { idPrefix: "oldham-" });
const place = (name, address) =>
  parse().establishments.find((e) => e.name === name && (!address || e.address === address));

describe("parseScoreGrade", () => {
  it("reads a plain score and a score with a grade", () => {
    assert.deepEqual(parseScoreGrade("94"), { score: 94, grade: null });
    assert.deepEqual(parseScoreGrade("98/A"), { score: 98, grade: "A" });
    assert.deepEqual(parseScoreGrade(" 100 / a "), { score: 100, grade: "A" });
  });

  it("has neither for an empty cell", () => {
    assert.deepEqual(parseScoreGrade(""), { score: null, grade: null });
  });

  it("reports anything else instead of guessing", () => {
    const warnings = [];
    assert.deepEqual(
      parseScoreGrade("PASS", (w) => warnings.push(w)),
      {
        score: null,
        grade: null,
      },
    );
    assert.equal(warnings.length, 1);
  });
});

describe("parseScoreCell", () => {
  it("is empty for a cell with no score link", () => {
    assert.deepEqual(parseScoreCell('<span style="white-space:nowrap;"> </span> <br> </td>'), {
      score: null,
      grade: null,
      violations: [],
    });
  });

  it("unescapes quotes in the popup's items", () => {
    const cell =
      "<a onmouseover=\"detailRolloverPopup('JOE\\'S', '', '<ul><li>Employee\\'s  hands &amp; arms</li></ul>', true);\">97</a>";
    assert.deepEqual(parseScoreCell(cell), {
      score: 97,
      grade: null,
      violations: ["Employee's hands & arms"],
    });
  });
});

describe("parsePortalPage", () => {
  it("reads every row and groups them into places", () => {
    const { total, establishments, warnings } = parse();
    assert.equal(total, 8);
    assert.equal(establishments.length, 7); // Buckner Elementary has two rows
    assert.deepEqual(warnings, []);
  });

  it("gives a place with no inspection yet an empty list", () => {
    assert.deepEqual(place("502FITRITION").inspections, []);
  });

  it("reads a clean inspection: date, score, nothing marked", () => {
    const [only, ...rest] = place("7 BREW COFFEE").inspections;
    assert.deepEqual(rest, []);
    assert.equal(only.kind, "routine");
    assert.equal(only.inspection_date, "2026-10-08");
    assert.equal(only.score, 100);
    assert.deepEqual(only.violations, []);
  });

  it("lists a follow-up before the inspection it followed", () => {
    const [followUp, routine] = place("A TASTE OF THAI").inspections;
    assert.deepEqual(
      [followUp.kind, followUp.inspection_date, followUp.score],
      ["follow_up", "2026-05-26", 100],
    );
    assert.deepEqual(
      [routine.kind, routine.inspection_date, routine.score],
      ["routine", "2026-03-18", 94],
    );
    assert.equal(routine.violations.length, 5);
    assert.equal(routine.violations[3], "Wiping cloths: properly used and stored"); // one space
  });

  it("decodes names, and keeps items that contain a semicolon whole", () => {
    const applebees = place("APPLEBEE'S IHOP #75057");
    assert.ok(applebees, "name with &#39; decoded");
    assert.ok(
      applebees.inspections[1].violations.includes(
        "Proper cooling methods used; adequate equipment for temperature control",
      ),
    );
    assert.ok(place("BARN 8 FARM RESTAURANT & BOURBON BAR"), "name with &amp; decoded");
  });

  it("keeps a follow-up that has a date but no score yet", () => {
    const [followUp] = place("APPLEBEE'S IHOP #75057").inspections;
    assert.deepEqual(
      [followUp.kind, followUp.inspection_date, followUp.score],
      ["follow_up", "2026-06-15", null],
    );
  });

  it("splits a score like 98/A into score and grade", () => {
    const routine = place("BARN 8 FARM RESTAURANT & BOURBON BAR").inspections.find(
      (i) => i.kind === "routine",
    );
    assert.deepEqual([routine.score, routine.grade], [98, "A"]);
  });

  it("keeps both results when a place is listed once per kind of inspection", () => {
    const scores = place("BUCKNER ELEMENTARY").inspections.map((i) => i.score);
    assert.deepEqual(scores.sort(), [100, 92]);
  });

  it("spells the town one way, and keeps the original", () => {
    const pizza = place("HOMETOWN PIZZA", "HWY 53, BLDG 2, LAGRANGE SQUARE");
    assert.equal(pizza.city, "LA GRANGE");
    assert.equal(pizza.raw_city, "LAGRANGE");
    assert.equal(pizza.inspections[0].inspection_date, "2026-11-09");
  });

  it("makes ids from the name and address, with the county's prefix", () => {
    const e = place("7 BREW COFFEE");
    assert.equal(e.id, establishmentId("7 brew coffee", " 809 SOUTH FIRST AVE ", "oldham-"));
    assert.match(e.id, /^oldham-[0-9a-f]{12}$/);
    assert.notEqual(e.id, establishmentId(e.name, e.address, "bullitt-"));
  });

  it("gives the same result however the rows are ordered", () => {
    const rows = [...PAGE.matchAll(/<tr>\s*<td class="ttc"[\s\S]*?<\/tr>/g)].map((m) => m[0]);
    let reversed = PAGE;
    rows.forEach((row, i) => (reversed = reversed.replace(row, `@@${i}@@`)));
    rows.forEach((_, i) => (reversed = reversed.replace(`@@${i}@@`, rows[rows.length - 1 - i])));
    const byId = (list) => [...list].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byId(parse(reversed).establishments), byId(parse().establishments));
  });

  it("stops when the columns change", () => {
    const changed = PAGE.replace("LAST INSPECTION DATE", "INSPECTED ON");
    assert.throws(() => parse(changed), /Unexpected columns/);
    assert.equal(COLUMNS.length, 7);
  });

  it("stops when the page holds fewer rows than the portal says exist", () => {
    const short = PAGE.replace(/(Pagination__TotalItems">)8</, "$1336<");
    assert.throws(() => parse(short), /8 rows but the portal says 336/);
  });

  it("stops when there is no table at all (an error page)", () => {
    assert.throws(() => parse("<html><body>Server Error</body></html>"), /no inspection table/);
  });
});

describe("county summary", () => {
  const { establishments } = parse();

  it("counts places and inspections", () => {
    assert.deepEqual(countyCounts(establishments), {
      places: 7,
      notInspected: 1,
      inspections: 10,
      followUps: 3,
      withViolations: 4,
      newest: "2026-11-09",
    });
  });

  it("lists the newest inspections first", () => {
    const newest = newestInspections(establishments, 2);
    assert.deepEqual(
      newest.map((i) => [i.inspection_date, i.name]),
      [
        ["2026-11-09", "HOMETOWN PIZZA"],
        ["2026-10-08", "7 BREW COFFEE"],
      ],
    );
  });
});

describe("counties", () => {
  it("knows Oldham as county 93, with ids starting oldham-", () => {
    assert.equal(countyById("oldham").number, 93);
    assert.equal(idPrefix(COUNTIES.oldham), "oldham-");
  });

  it("knows Bullitt as county 15, with the same ids and pins as its sheet", () => {
    const bullitt = countyById("bullitt");
    assert.equal(bullitt.number, 15);
    assert.equal(idPrefix(bullitt), "bullitt-");
    assert.equal(bullitt.overrides, "pipeline/regions/bullitt/overrides.json");
  });

  it("names the known counties when asked for another", () => {
    assert.throws(() => countyById("narnia"), /Unknown county "narnia". Known: bullitt, oldham/);
  });
});
