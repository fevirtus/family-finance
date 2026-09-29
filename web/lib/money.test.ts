import { describe, expect, it } from "vitest";
import { formatVnd, parseVnd, shortVnd } from "./money";

describe("parseVnd", () => {
  it.each([
    ["45k", 45_000],
    ["45K", 45_000],
    ["320k ", 320_000],
    ["1tr2", 1_200_000],
    ["1tr25", 1_250_000],
    ["2tr", 2_000_000],
    ["1.5tr", 1_500_000],
    ["1,5tr", 1_500_000],
    ["1.200.000", 1_200_000],
    ["1,200,000", 1_200_000],
    ["1200000", 1_200_000],
    ["50.000đ", 50_000],
    ["50.000 vnđ", 50_000],
  ])("parses %s", (input, expected) => {
    expect(parseVnd(input)).toBe(expected);
  });

  it.each(["", "abc", "1.5", "-5k", "12.34.5"])("rejects %s", (input) => {
    expect(parseVnd(input)).toBeNull();
  });
});

describe("formatVnd", () => {
  it("uses Vietnamese grouping", () => {
    expect(formatVnd(1_200_000)).toBe("1.200.000 đ");
    expect(formatVnd(-45_000)).toBe("-45.000 đ");
  });
});

describe("shortVnd", () => {
  it.each([
    [45_000, "45k"],
    [-320_000, "-320k"],
    [4_200_000, "4,2tr"],
    [25_000_000, "25tr"],
    [12_450_000, "12,5tr"],
    [500, "500đ"],
    [999_600, "1tr"],
  ])("formats %d as %s", (amount, expected) => {
    expect(shortVnd(amount)).toBe(expected);
  });
});
