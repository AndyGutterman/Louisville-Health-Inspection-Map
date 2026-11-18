import { describe, expect, it } from "vitest";
import { PAGE_SIZES, pageList, pageWindow } from "./tablePaging.js";

describe("pageWindow", () => {
  it("gives the row range of a page", () => {
    expect(pageWindow(1234, 2, 25)).toEqual({
      totalPages: 50,
      safePage: 2,
      startRow: 26,
      endRow: 50,
    });
  });

  it("ends the last page at the last row", () => {
    expect(pageWindow(60, 3, 25)).toMatchObject({ startRow: 51, endRow: 60 });
  });

  it("shows the last page for a page past the end", () => {
    expect(pageWindow(30, 9, 25)).toMatchObject({ safePage: 2, startRow: 26, endRow: 30 });
  });

  it("has one empty page when there are no rows", () => {
    expect(pageWindow(0, 1, 25)).toEqual({ totalPages: 1, safePage: 1, startRow: 0, endRow: 0 });
  });
});

describe("pageList", () => {
  it("lists every page when there are 7 or fewer", () => {
    expect(pageList(1, 1)).toEqual([1]);
    expect(pageList(7, 4)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("shows the ends and the current page's neighbours, with gaps", () => {
    expect(pageList(20, 10)).toEqual([1, "…", 9, 10, 11, "…", 20]);
  });

  it("leaves out a gap where no page is skipped", () => {
    expect(pageList(20, 1)).toEqual([1, 2, "…", 20]);
    expect(pageList(20, 3)).toEqual([1, 2, 3, 4, "…", 20]);
    expect(pageList(20, 20)).toEqual([1, "…", 19, 20]);
  });
});

describe("PAGE_SIZES", () => {
  it("never asks for more than 100 rows at once", () => {
    expect(Math.max(...PAGE_SIZES)).toBe(100);
  });
});
