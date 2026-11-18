import { describe, expect, it } from "vitest";
import { toTitleCase } from "./titleCase.js";

describe("toTitleCase", () => {
  it("title-cases a description written in capitals", () => {
    expect(toTitleCase("HANDWASHING SINKS SUPPLIED")).toBe("Handwashing Sinks Supplied");
  });

  it("keeps small words lower case, except the first", () => {
    expect(toTitleCase("FOOD IN GOOD CONDITION AND SAFE")).toBe("Food in Good Condition and Safe");
    expect(toTitleCase("THE FLOORS ARE CLEAN")).toBe("The Floors Are Clean");
  });

  it("leaves mixed-case text alone", () => {
    expect(toTitleCase("Proper cold holding temperatures")).toBe(
      "Proper cold holding temperatures",
    );
  });

  it("passes empty values through", () => {
    expect(toTitleCase("")).toBe("");
    expect(toTitleCase(null)).toBe(null);
    expect(toTitleCase(undefined)).toBe(undefined);
  });
});
