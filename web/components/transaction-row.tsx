"use client";

import { useTransactionSheet } from "@/components/app-shell";
import { formatVnd } from "@/lib/money";
import { formatVnDateTime } from "@/lib/time";
import type { Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  transaction: Transaction;
  categoryName: string | null;
  categoryIcon: string | null;
  accountName: string;
  showDate?: boolean;
};

export function TransactionRow({
  transaction: t,
  categoryName,
  categoryIcon,
  accountName,
  showDate,
}: Props) {
  const { openEdit } = useTransactionSheet();
  const time = formatVnDateTime(t.occurred_at);
  return (
    <button
      type="button"
      onClick={() => openEdit(t)}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-lg">
        {t.is_internal_transfer ? "🔁" : (categoryIcon ?? "❔")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {t.description || categoryName || "Chưa phân loại"}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {t.is_internal_transfer ? "Chuyển nội bộ" : (categoryName ?? "Chưa phân loại")} ·{" "}
          {accountName} · {showDate ? time : time.slice(6)}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          t.is_internal_transfer
            ? "text-muted-foreground"
            : t.amount < 0
              ? "text-red-600"
              : "text-emerald-600",
        )}
      >
        {formatVnd(t.amount)}
      </span>
    </button>
  );
}
