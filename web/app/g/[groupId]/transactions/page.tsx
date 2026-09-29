import { apiFetch } from "@/lib/api";
import { formatVnd } from "@/lib/money";
import { currentVnMonth, formatVnDateTime } from "@/lib/time";
import type { Account, Category, TransactionList } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";
import { createTransaction, deleteTransaction, updateTransaction } from "./actions";
import { TransactionForm } from "./transaction-form";

type SearchParams = {
  month?: string;
  account_id?: string;
  category_id?: string;
  q?: string;
  uncategorized?: string;
};

const PAGE_LIMIT = 200;

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

  const query = new URLSearchParams({ month, limit: String(PAGE_LIMIT) });
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

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Giao dịch</h1>

      <form className="flex flex-wrap items-end gap-2">
        <input type="month" name="month" defaultValue={month} className={inputCls} />
        <select name="account_id" defaultValue={sp.account_id ?? ""} className={inputCls}>
          <option value="">Tất cả tài khoản</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select name="category_id" defaultValue={sp.category_id ?? ""} className={inputCls}>
          <option value="">Tất cả danh mục</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ""}
              {c.name}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={sp.q ?? ""} maxLength={100} placeholder="Tìm…" className={inputCls} />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="uncategorized" value="1" defaultChecked={sp.uncategorized === "1"} />
          Chưa phân loại
        </label>
        <button className={btnSecondaryCls}>Lọc</button>
      </form>

      <div className="flex flex-wrap gap-6 text-sm">
        <span>
          Chi: <b className="text-red-600">{formatVnd(list.sum_expense)}</b>
        </span>
        <span>
          Thu: <b className="text-emerald-600">{formatVnd(list.sum_income)}</b>
        </span>
        <span className="text-neutral-500">{list.total_count} giao dịch</span>
      </div>

      <details className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <summary className={`${btnCls} inline-block cursor-pointer list-none`}>+ Thêm giao dịch</summary>
        <div className="mt-4">
          <TransactionForm
            accounts={accounts}
            categories={categories}
            submitLabel="Thêm"
            action={createTransaction.bind(null, groupId)}
          />
        </div>
      </details>

      <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {list.items.length === 0 && <li className="p-3 text-sm text-neutral-500">Không có giao dịch.</li>}
        {list.items.map((t) => {
          const category = t.category_id ? categoryById.get(t.category_id) : undefined;
          return (
            <li key={t.id} className="p-3">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3">
                  <span className="w-24 text-xs text-neutral-500">{formatVnDateTime(t.occurred_at)}</span>
                  <span className="flex-1 truncate">
                    {category ? `${category.icon ?? ""} ${category.name}` : "❔ Chưa phân loại"}
                    {t.description && <span className="text-neutral-500"> · {t.description}</span>}
                  </span>
                  <span className="text-xs text-neutral-500">{accountName.get(t.account_id)}</span>
                  <span className={`w-32 text-right font-medium ${t.amount < 0 ? "text-red-600" : "text-emerald-600"}`}>
                    {formatVnd(t.amount)}
                  </span>
                </summary>
                <div className="mt-3 space-y-3">
                  <TransactionForm
                    accounts={accounts}
                    categories={categories}
                    initial={t}
                    submitLabel="Lưu"
                    action={updateTransaction.bind(null, groupId, t.id)}
                  />
                  <form action={deleteTransaction.bind(null, groupId, t.id)}>
                    <button className="text-sm text-red-600 hover:underline">Xoá giao dịch</button>
                  </form>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      {list.total_count > list.items.length && (
        <p className="text-sm text-neutral-500">
          Đang hiển thị {list.items.length}/{list.total_count}. Lọc hẹp hơn để xem thêm.
        </p>
      )}
    </section>
  );
}
