import { describe, expect, it } from "vitest";
import { shiftMonth } from "./month-switcher";

describe("shiftMonth", () => {
  it.each([
    ["2026-09", -1, "2026-08"],
    ["2026-01", -1, "2025-12"],
    ["2026-12", 1, "2027-01"],
    ["2026-09", 0, "2026-09"],
  ])("%s %+d → %s", (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });
});
