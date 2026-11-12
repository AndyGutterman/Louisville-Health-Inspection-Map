import { describe, expect, it } from "vitest";
import { cleanCode, isCompleteCode } from "./authCode.js";

describe("cleanCode", () => {
  it("keeps digits and drops spaces and dashes from a paste", () => {
    expect(cleanCode(" 123 456 ")).toBe("123456");
    expect(cleanCode("123-456")).toBe("123456");
  });

  it("stops at 10 digits", () => {
    expect(cleanCode("123456789012")).toBe("1234567890");
  });

  it("handles empty input", () => {
    expect(cleanCode(undefined)).toBe("");
    expect(cleanCode("abc")).toBe("");
  });
});

describe("isCompleteCode", () => {
  it("accepts 6 to 10 digits", () => {
    expect(isCompleteCode("123456")).toBe(true);
    expect(isCompleteCode("12345678")).toBe(true);
  });

  it("rejects short or non-digit codes", () => {
    expect(isCompleteCode("12345")).toBe(false);
    expect(isCompleteCode("12345a")).toBe(false);
  });
});
