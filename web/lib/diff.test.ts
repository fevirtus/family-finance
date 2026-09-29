import { describe, expect, it } from "vitest";
import type { Transaction, TransactionInput } from "./types";
import { changedFields } from "./diff";

const initial: Transaction = {
  id: "t1",
  account_id: "a1",
  user_id: "u1",
  amount: -45_000,
  occurred_at: "2026-09-29T05:30:00Z",
  description: "Phở",
  merchant: null,
  counterparty: null,
  category_id: "c1",
  source: "telegram",
  status: "confirmed",
  classified_by: "llm",
  is_internal_transfer: false,
  reconciled: false,
  note: null,
  created_at: "2026-09-29T05:30:00Z",
  updated_at: "2026-09-29T05:30:00Z",
};

const same: TransactionInput = {
  account_id: "a1",
  amount: -45_000,
  occurred_at: "2026-09-29T12:30:00+07:00",
  description: "Phở",
  category_id: "c1",
  note: null,
};

describe("changedFields", () => {
  it("returns nothing when only the timezone representation differs", () => {
    expect(changedFields(initial, same)).toEqual({});
  });

  it("returns only the note when only the note changed (keeps classifier)", () => {
    expect(changedFields(initial, { ...same, note: "ăn sáng" })).toEqual({ note: "ăn sáng" });
  });

  it("returns every changed field", () => {
    expect(
      changedFields(initial, { ...same, amount: -50_000, category_id: null, account_id: "a2" }),
    ).toEqual({ amount: -50_000, category_id: null, account_id: "a2" });
  });

  it("treats empty and null notes as equal", () => {
    expect(changedFields({ ...initial, note: "" }, same)).toEqual({});
  });
});
