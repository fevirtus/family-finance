"use client";

import { useId, useState, useTransition } from "react";
import { parseVnd } from "@/lib/money";
import { nowVnLocalInput, toVnLocalInput, vnLocalInputToIso } from "@/lib/time";
import type { Account, ActionResult, Category, Transaction, TransactionInput } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";

type Kind = "expense" | "income";

type Props = {
  accounts: Account[];
  categories: Category[];
  initial?: Transaction;
  submitLabel: string;
  action: (input: TransactionInput) => Promise<ActionResult>;
};

export function TransactionForm({ accounts, categories, initial, submitLabel, action }: Props) {
  const id = useId();
  const [kind, setKind] = useState<Kind>(initial && initial.amount > 0 ? "income" : "expense");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const usableAccounts = accounts.filter((a) => !a.archived || a.id === initial?.account_id);
  const kindCategories = categories.filter(
    (c) => c.kind === kind && (!c.archived || c.id === initial?.category_id),
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const magnitude = parseVnd(String(data.get("amount") ?? ""));
    if (!magnitude || magnitude <= 0) {
      setError("Số tiền không hợp lệ");
      return;
    }
    const accountId = String(data.get("account_id") ?? "");
    if (!accountId) {
      setError("Chọn tài khoản");
      return;
    }
    let occurredAt: string;
    try {
      occurredAt = vnLocalInputToIso(String(data.get("occurred_at") ?? ""));
    } catch {
      setError("Thời gian không hợp lệ");
      return;
    }

    const input: TransactionInput = {
      account_id: accountId,
      amount: kind === "expense" ? -magnitude : magnitude,
      occurred_at: occurredAt,
      description: String(data.get("description") ?? "").trim(),
      category_id: String(data.get("category_id") ?? "") || null,
      note: String(data.get("note") ?? "").trim() || null,
    };
    setError(null);
    startTransition(async () => {
      const result = await action(input);
      if (result.error) {
        setError(result.error);
      } else if (!initial) {
        form.reset();
      }
    });
  }

  const kindButton = (value: Kind, label: string) => (
    <button
      type="button"
      aria-pressed={kind === value}
      onClick={() => setKind(value)}
      className={kind === value ? btnCls : btnSecondaryCls}
    >
      {label}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="flex gap-2 sm:col-span-2">
        {kindButton("expense", "Chi")}
        {kindButton("income", "Thu")}
      </div>

      <label htmlFor={`${id}-amount`} className="text-sm">
        Số tiền
      </label>
      <input
        id={`${id}-amount`}
        name="amount"
        inputMode="decimal"
        placeholder="45k, 1tr2, 1.200.000"
        defaultValue={initial ? String(Math.abs(initial.amount)) : ""}
        className={inputCls}
      />

      <label htmlFor={`${id}-account`} className="text-sm">
        Tài khoản
      </label>
      <select
        id={`${id}-account`}
        name="account_id"
        defaultValue={initial?.account_id ?? usableAccounts[0]?.id ?? ""}
        className={inputCls}
      >
        {usableAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-category`} className="text-sm">
        Danh mục
      </label>
      <select
        key={kind}
        id={`${id}-category`}
        name="category_id"
        defaultValue={
          initial && initial.amount > 0 === (kind === "income") ? (initial.category_id ?? "") : ""
        }
        className={inputCls}
      >
        <option value="">— Chưa phân loại —</option>
        {kindCategories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon ? `${c.icon} ` : ""}
            {c.name}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-time`} className="text-sm">
        Thời gian
      </label>
      <input
        id={`${id}-time`}
        name="occurred_at"
        type="datetime-local"
        defaultValue={initial ? toVnLocalInput(initial.occurred_at) : nowVnLocalInput()}
        suppressHydrationWarning
        className={inputCls}
      />

      <label htmlFor={`${id}-description`} className="text-sm">
        Mô tả
      </label>
      <input
        id={`${id}-description`}
        name="description"
        maxLength={500}
        defaultValue={initial?.description ?? ""}
        className={inputCls}
      />

      <label htmlFor={`${id}-note`} className="text-sm">
        Ghi chú
      </label>
      <input
        id={`${id}-note`}
        name="note"
        maxLength={2000}
        defaultValue={initial?.note ?? ""}
        className={inputCls}
      />

      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2">
        <button type="submit" className={btnCls} disabled={pending}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
