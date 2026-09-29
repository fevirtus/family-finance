import type { Transaction, TransactionInput, TransactionPatch } from "./types";

/** Only the fields the user actually changed, so untouched fields keep their server state. */
export function changedFields(initial: Transaction, next: TransactionInput): TransactionPatch {
  const patch: TransactionPatch = {};
  if (next.account_id !== initial.account_id) patch.account_id = next.account_id;
  if (next.amount !== initial.amount) patch.amount = next.amount;
  if (Date.parse(next.occurred_at) !== Date.parse(initial.occurred_at)) {
    patch.occurred_at = next.occurred_at;
  }
  if (next.description !== initial.description) patch.description = next.description;
  if (next.category_id !== initial.category_id) patch.category_id = next.category_id;
  if ((next.note || null) !== (initial.note || null)) patch.note = next.note;
  return patch;
}
