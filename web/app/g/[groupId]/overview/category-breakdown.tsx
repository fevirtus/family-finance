"use client";

import Link from "next/link";
import { useState } from "react";
import { shortVnd } from "@/lib/money";
import type { Category, CategoryAmount } from "@/lib/types";

const COLLAPSED = 6;

export function CategoryBreakdown({
  groupId,
  month,
  rows,
  total,
  categories,
}: {
  groupId: string;
  month: string;
  rows: CategoryAmount[];
  total: number;
  categories: Category[];
}) {
  const [expanded, setExpanded] = useState(false);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const visible = expanded ? rows : rows.slice(0, COLLAPSED);
  if (rows.length === 0) return null;

  return (
    <div className="space-y-1">
      {visible.map((row) => {
        const category = row.category_id ? byId.get(row.category_id) : undefined;
        const filter = row.category_id ? `category_id=${row.category_id}` : "uncategorized=1";
        const pct = total === 0 ? 0 : Math.round((Math.abs(row.amount) / Math.abs(total)) * 100);
        return (
          <Link
            key={row.category_id ?? "none"}
            href={`/g/${groupId}/transactions?month=${month}&${filter}`}
            className="flex min-h-11 items-center gap-3 rounded-lg px-1 hover:bg-muted/60"
          >
            <span className="w-6 text-center text-lg">{category?.icon ?? "❔"}</span>
            <span className="w-24 shrink-0 truncate text-sm">
              {category?.name ?? "Chưa phân loại"}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
            <span className="w-14 text-right text-sm tabular-nums">
              {shortVnd(Math.abs(row.amount))}
            </span>
          </Link>
        );
      })}
      {rows.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="min-h-10 w-full text-sm text-primary"
        >
          {expanded ? "Thu gọn" : `Xem tất cả (${rows.length})`}
        </button>
      )}
    </div>
  );
}
