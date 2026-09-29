import Link from "next/link";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionRow } from "@/components/transaction-row";
import { apiFetch } from "@/lib/api";
import { formatVnd } from "@/lib/money";
import { currentVnMonth } from "@/lib/time";
import type { Account, Category, Summary, TransactionList } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryBreakdown } from "./category-breakdown";

function changeLabel(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const pct = Math.round(((Math.abs(current) - Math.abs(previous)) / Math.abs(previous)) * 100);
  if (pct === 0) return "Bằng tháng trước";
  return `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}% so với tháng trước`;
}

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { groupId } = await params;
  const month = (await searchParams).month || currentVnMonth();
  const [summary, recent, accounts, categories] = await Promise.all([
    apiFetch<Summary>(`/groups/${groupId}/summary?month=${month}`),
    apiFetch<TransactionList>(`/groups/${groupId}/transactions?month=${month}&limit=5`),
    apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`),
    apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const net = summary.total_income + summary.total_expense;
  const change = changeLabel(summary.total_expense, summary.prev_total_expense);

  return (
    <div className="space-y-4">
      <MonthSwitcher month={month} basePath={`/g/${groupId}/overview`} />

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">Đã chi</div>
        <div className="text-3xl font-bold tabular-nums text-red-600">
          {formatVnd(Math.abs(summary.total_expense))}
        </div>
        {change && <div className="mt-1 text-xs text-muted-foreground">{change}</div>}
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Đã thu</div>
            <div className="font-semibold tabular-nums text-emerald-600">
              {formatVnd(summary.total_income)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Chênh lệch</div>
            <div
              className={cn(
                "font-semibold tabular-nums",
                net < 0 ? "text-red-600" : "text-emerald-600",
              )}
            >
              {formatVnd(net)}
            </div>
          </div>
        </div>
      </section>

      {summary.uncategorized_count > 0 && (
        <Link
          href={`/g/${groupId}/transactions?month=${month}&uncategorized=1`}
          className="flex min-h-11 items-center justify-between rounded-xl bg-amber-100 px-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>❔ {summary.uncategorized_count} giao dịch chưa phân loại</span>
          <span className="font-medium">Phân loại</span>
        </Link>
      )}

      <section className="rounded-2xl border bg-card p-4 shadow-sm">
        <h2 className="mb-2 font-semibold">Chi theo danh mục</h2>
        {summary.expense_by_category.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Chưa có giao dịch tháng này — bấm + để thêm.
          </p>
        ) : (
          <CategoryBreakdown
            groupId={groupId}
            month={month}
            rows={summary.expense_by_category}
            total={summary.total_expense}
            categories={categories}
          />
        )}
      </section>

      {recent.items.length > 0 && (
        <section className="rounded-2xl border bg-card shadow-sm">
          <div className="flex items-center justify-between px-4 pt-3">
            <h2 className="font-semibold">Gần đây</h2>
            <Link href={`/g/${groupId}/transactions?month=${month}`} className="text-sm text-primary">
              Xem tất cả
            </Link>
          </div>
          <div className="divide-y py-1">
            {recent.items.map((t) => {
              const category = t.category_id ? categoryById.get(t.category_id) : undefined;
              return (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  categoryName={category?.name ?? null}
                  categoryIcon={category?.icon ?? null}
                  accountName={accountName.get(t.account_id) ?? ""}
                  showDate
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
