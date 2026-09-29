import Link from "next/link";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionRow } from "@/components/transaction-row";
import { apiFetch } from "@/lib/api";
import { groupByVnDay, vnDayLabel } from "@/lib/days";
import { formatVnd, shortVnd } from "@/lib/money";
import { currentVnMonth } from "@/lib/time";
import type { Account, Category, TransactionList } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TransactionFilters } from "./filters";

type SearchParams = {
  month?: string;
  account_id?: string;
  category_id?: string;
  q?: string;
  uncategorized?: string;
  limit?: string;
};

const PAGE = 50;
const MAX = 200;

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { groupId } = await params;
  const sp = await searchParams;
  const month = sp.month || currentVnMonth();
  const limit = Math.min(MAX, Math.max(PAGE, Number(sp.limit) || PAGE));

  const query = new URLSearchParams({ month, limit: String(limit) });
  if (sp.account_id) query.set("account_id", sp.account_id);
  if (sp.category_id) query.set("category_id", sp.category_id);
  if (sp.q) query.set("q", sp.q);
  if (sp.uncategorized === "1") query.set("uncategorized", "true");

  const [accounts, categories, list] = await Promise.all([
    apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`),
    apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`),
    apiFetch<TransactionList>(`/groups/${groupId}/transactions?${query}`),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const days = groupByVnDay(list.items);

  const keep: Record<string, string> = {};
  for (const key of ["account_id", "category_id", "q", "uncategorized"] as const) {
    const value = sp[key];
    if (value) keep[key] = value;
  }
  const more = new URLSearchParams({ ...keep, month, limit: String(Math.min(MAX, limit + PAGE)) });

  return (
    <div className="space-y-3">
      <MonthSwitcher month={month} basePath={`/g/${groupId}/transactions`} extraParams={keep} />
      <TransactionFilters accounts={accounts} categories={categories} />

      <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-2 text-sm">
        <span>
          Chi <b className="tabular-nums text-red-600">{shortVnd(Math.abs(list.sum_expense))}</b>
        </span>
        <span>
          Thu <b className="tabular-nums text-emerald-600">{shortVnd(list.sum_income)}</b>
        </span>
        <span className="text-muted-foreground">{list.total_count} GD</span>
      </div>

      {days.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">Không có giao dịch nào.</p>
      )}

      {days.map((day) => (
        <section key={day.key}>
          <div className="flex items-center justify-between px-1 pb-1 pt-2 text-xs text-muted-foreground">
            <span className="font-medium">{vnDayLabel(day.key)}</span>
            <span className={cn("tabular-nums", day.total > 0 && "text-emerald-600")}>
              {formatVnd(day.total)}
            </span>
          </div>
          <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
            {day.items.map((t) => {
              const category = t.category_id ? categoryById.get(t.category_id) : undefined;
              return (
                <TransactionRow
                  key={t.id}
                  transaction={t}
                  categoryName={category?.name ?? null}
                  categoryIcon={category?.icon ?? null}
                  accountName={accountName.get(t.account_id) ?? ""}
                />
              );
            })}
          </div>
        </section>
      ))}

      {list.total_count > list.items.length &&
        (limit < MAX ? (
          <Link
            href={`/g/${groupId}/transactions?${more}`}
            scroll={false}
            className="flex min-h-11 items-center justify-center rounded-xl border text-sm"
          >
            Xem thêm
          </Link>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            Đang hiện {list.items.length}/{list.total_count}. Lọc hẹp hơn để xem thêm.
          </p>
        ))}
    </div>
  );
}
