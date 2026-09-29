import { describe, expect, it } from "vitest";
import {
  currentVnMonth,
  formatVnDateTime,
  toVnLocalInput,
  vnLocalInputToIso,
} from "./time";

describe("time helpers", () => {
  it("converts UTC ISO to a VN datetime-local value", () => {
    expect(toVnLocalInput("2026-09-30T16:30:00Z")).toBe("2026-09-30T23:30");
  });

  it("converts a VN datetime-local value to ISO with +07:00", () => {
    expect(vnLocalInputToIso("2026-09-30T23:30")).toBe("2026-09-30T23:30:00+07:00");
  });

  it("rejects malformed datetime-local values", () => {
    expect(() => vnLocalInputToIso("2026-09-30")).toThrow();
  });

  it("computes the current month in VN time", () => {
    expect(currentVnMonth(new Date("2026-09-30T17:05:00Z"))).toBe("2026-10");
  });

  it("formats for display in VN time", () => {
    expect(formatVnDateTime("2026-09-29T05:30:00Z")).toBe("29/09 12:30");
  });
});
