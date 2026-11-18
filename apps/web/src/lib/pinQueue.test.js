import { describe, expect, it } from "vitest";
import {
  BUCKETS,
  POLL_MAX_MS,
  bucketLabel,
  countsByRegion,
  editorStart,
  firstBucket,
  fixArgs,
  inRegionBox,
  keepPolling,
  mapsSearchUrl,
  outcomeText,
  pendingCount,
  pinSource,
  readPasted,
  regionChoices,
  sourceLine,
  startPin,
  todoCount,
} from "./pinQueue.js";

const PLACE = {
  id: "oldham-1",
  region: "oldham",
  name: "ASH CAFE",
  address: "3000 ASH AVE.",
  city: "PEEWEE VALLEY",
  lon: null,
  lat: null,
};

describe("counts", () => {
  const byRegion = countsByRegion([
    { region: "jefferson", bucket: "missing", n: "12" },
    { region: "jefferson", bucket: "fixed", n: 3 },
    { region: "oldham", bucket: "pending", n: 2 },
    { region: "oldham", bucket: "outside", n: 1 },
    { region: "hardin", bucket: "missing", n: 4 },
  ]);

  it("groups the database's rows by county and queue", () =>
    expect(byRegion.jefferson).toEqual({ missing: 12, fixed: 3 }));

  it("counts only the queues that need a decision as to do", () => {
    expect(todoCount(byRegion.jefferson)).toBe(12);
    expect(todoCount(byRegion.oldham)).toBe(1);
    expect(todoCount(undefined)).toBe(0);
  });

  it("adds up what waits for Geocode now across counties", () =>
    expect(pendingCount(byRegion)).toBe(2));

  it("offers the site's counties in order, then any new one the database has", () => {
    const choices = regionChoices(byRegion);
    expect(choices[0]).toMatchObject({ id: "jefferson", todo: 12 });
    expect(choices.at(-1)).toMatchObject({ id: "hardin", name: "Hardin", todo: 4 });
    expect(choices.find((c) => c.id === "bullitt").todo).toBe(0);
  });

  it("opens a county on its first queue with something in it", () => {
    expect(firstBucket(byRegion.oldham)).toBe("outside");
    expect(firstBucket({})).toBe("missing");
  });

  it("names every queue", () => {
    for (const b of BUCKETS) expect(bucketLabel(b.key)).toBe(b.label);
    expect(bucketLabel("other")).toBe("other");
  });
});

describe("a place in the editor", () => {
  it("shows the source's address, even after a correction", () => {
    expect(sourceLine(PLACE)).toBe("3000 ASH AVE., PEEWEE VALLEY");
    expect(sourceLine({ ...PLACE, source_city: "PEEWEE VALLEY", city: "X" })).toBe(
      "3000 ASH AVE., PEEWEE VALLEY",
    );
  });

  it("starts from the saved correction, or the source's words", () => {
    expect(editorStart(PLACE)).toEqual({
      address: "3000 ASH AVE.",
      city: "PEEWEE VALLEY",
      note: "",
    });
    expect(editorStart({ ...PLACE, fix_city: "PEWEE VALLEY", fix_note: "typo" })).toMatchObject({
      city: "PEWEE VALLEY",
      note: "typo",
    });
  });

  it("starts the marker at the admin's pin, then the job's, then the current one", () => {
    expect(startPin(PLACE)).toBe(null);
    expect(startPin({ ...PLACE, lon: -85.5, lat: 38.3 })).toEqual({
      lon: -85.5,
      lat: 38.3,
      kind: "now",
    });
    expect(
      startPin({ ...PLACE, fix_status: "outside", result_lon: -84, result_lat: 37 }).kind,
    ).toBe("outside");
    expect(
      startPin({ ...PLACE, fix_action: "pin", fix_lon: -85.4, fix_lat: 38.4, lon: -85.4 }).kind,
    ).toBe("fix");
  });

  it("says where the current pin came from", () => {
    expect(pinSource(PLACE)).toBe("No pin");
    expect(pinSource({ ...PLACE, lon: 1, region: "jefferson" })).toBe("Louisville Metro's data");
    expect(pinSource({ ...PLACE, lon: 1, provider: "manual" })).toBe("Placed by hand");
    expect(pinSource({ ...PLACE, lon: 1, provider: "ky911-approx" })).toMatch(/between/);
  });

  it("says how an address fix went", () => {
    expect(outcomeText(PLACE)).toBe(null);
    const fix = { ...PLACE, fix_action: "address" };
    expect(outcomeText({ ...fix, fix_status: "pending" })).toMatch(/Waiting/);
    expect(
      outcomeText({ ...fix, fix_status: "found", result_lon: 1, result_provider: "census" }),
    ).toBe("Found (US Census geocoder)");
    expect(outcomeText({ ...fix, fix_status: "outside" })).toMatch(/outside the county/);
    expect(outcomeText({ ...fix, fix_status: "not_found" })).toMatch(/by hand/);
  });

  it("checks a pin against the county's box, with a little slack", () => {
    expect(inRegionBox("oldham", { lon: -85.45, lat: 38.4 })).toBe(true);
    expect(inRegionBox("oldham", { lon: -84.5, lat: 37.6 })).toBe(false);
    expect(inRegionBox("nowhere", { lon: 0, lat: 0 })).toBe(true);
  });

  it("links a Google Maps search for the place", () =>
    expect(mapsSearchUrl(PLACE)).toBe(
      "https://www.google.com/maps/search/?api=1&query=ASH%20CAFE%2C%203000%20ASH%20AVE.%2C%20PEEWEE%20VALLEY%2C%20KY",
    ));
});

describe("fixArgs", () => {
  it("sends a corrected town, trimmed", () =>
    expect(fixArgs("address", PLACE, { address: "3000 ASH AVE.", city: " PEWEE VALLEY " })).toEqual(
      {
        p_place_id: "oldham-1",
        p_action: "address",
        p_note: null,
        p_also: [],
        p_address: "3000 ASH AVE.",
        p_city: "PEWEE VALLEY",
      },
    ));

  it("refuses an address fix that changes nothing (case and spaces aside)", () => {
    expect(
      fixArgs("address", PLACE, { address: "3000 ash ave. ", city: "Peewee Valley" }).error,
    ).toMatch(/already has/);
    expect(fixArgs("address", PLACE, {}).error).toMatch(/Type the corrected/);
  });

  it("sends a pin rounded to about 10 cm, only inside Kentucky", () => {
    expect(
      fixArgs("pin", PLACE, { point: { lon: -85.491519123, lat: 38.308331987 } }),
    ).toMatchObject({
      p_lon: -85.491519,
      p_lat: 38.308332,
    });
    expect(fixArgs("pin", PLACE, { point: null }).error).toMatch(/Put the pin/);
    expect(fixArgs("pin", PLACE, { point: { lon: -74, lat: 40.7 } }).error).toMatch(/Put the pin/);
  });

  it("sends a hide or skip with its note and the other places at the address", () =>
    expect(fixArgs("hide", PLACE, { note: " food truck ", also: ["oldham-2"] })).toEqual({
      p_place_id: "oldham-1",
      p_action: "hide",
      p_note: "food truck",
      p_also: ["oldham-2"],
    }));
});

describe("readPasted", () => {
  it("reads a pasted latitude, longitude", () =>
    expect(readPasted("38.30833, -85.49152")).toEqual({
      point: { lat: 38.30833, lon: -85.49152 },
    }));
  it("says what is wrong, or nothing for an empty box", () => {
    expect(readPasted("-85.49, 38.30").error).toMatch(/not in Kentucky/);
    expect(readPasted("")).toEqual({ error: null });
  });
});

describe("keepPolling", () => {
  it("watches while something is waiting, for at most five minutes", () => {
    expect(keepPolling({ startedAt: 0, now: 10_000, statuses: ["pending", "found"] })).toBe(true);
    expect(keepPolling({ startedAt: 0, now: 10_000, statuses: ["found", "not_found"] })).toBe(
      false,
    );
    expect(keepPolling({ startedAt: 0, now: POLL_MAX_MS, statuses: ["pending"] })).toBe(false);
  });
});
