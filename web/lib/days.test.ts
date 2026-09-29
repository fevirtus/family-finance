import { describe, expect, it } from "vitest";
import { groupByVnDay, vnDateKey, vnDayLabel } from "./days";

const tx = (occurred_at: string, amount: number, is_internal_transfer = false) => ({
  occurred_at,
  amount,
  is_internal_transfer,
});

describe("vnDateKey", () => {
  it("uses the Vietnam calendar day", () => {
    expect(vnDateKey("2026-09-30T16:30:00Z")).toBe("2026-09-30");
    expect(vnDateKey("2026-09-30T17:10:00Z")).toBe("2026-10-01");
  });
});

describe("groupByVnDay", () => {
  it("groups consecutive items by VN day, keeping order, excluding transfers from totals", () => {
    const items = [
      tx("2026-09-30T17:10:00Z", -10_000),
      tx("2026-09-30T16:30:00Z", -45_000),
      tx("2026-09-30T02:00:00Z", -2_000_000, true),
      tx("2026-09-29T05:00:00Z", 25_000_000),
    ];
    const groups = groupByVnDay(items);
    expect(groups.map((g) => [g.key, g.items.length, g.total])).toEqual([
      ["2026-10-01", 1, -10_000],
      ["2026-09-30", 2, -45_000],
      ["2026-09-29", 1, 25_000_000],
    ]);
  });
});

describe("groupByVnDay with more pages", () => {
  it("marks only the last day as incomplete when more items exist", () => {
    const items = [tx("2026-09-30T05:00:00Z", -1), tx("2026-09-29T05:00:00Z", -2)];
    expect(groupByVnDay(items, { hasMore: true }).map((g) => g.complete)).toEqual([true, false]);
    expect(groupByVnDay(items).map((g) => g.complete)).toEqual([true, true]);
  });
});

describe("vnDayLabel", () => {
  const now = new Date("2026-09-29T03:00:00Z"); // 10:00 Tue 29/09 in VN
  it("labels today and yesterday", () => {
    expect(vnDayLabel("2026-09-29", now)).toBe("Hôm nay · T3 29/09");
    expect(vnDayLabel("2026-09-28", now)).toBe("Hôm qua · T2 28/09");
  });
  it("labels other days with weekday", () => {
    expect(vnDayLabel("2026-09-24", now)).toBe("T5 24/09");
    expect(vnDayLabel("2026-09-27", now)).toBe("CN 27/09");
  });
});
