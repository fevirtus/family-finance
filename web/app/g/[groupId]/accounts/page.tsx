import { apiFetch } from "@/lib/api";
import type { Account, AccountKind } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";
import { createAccount, renameAccount, setAccountArchived } from "./actions";

const KIND_LABEL: Record<AccountKind, string> = {
  bank: "Ngân hàng",
  ewallet: "Ví điện tử",
  cash: "Tiền mặt",
  credit: "Thẻ tín dụng",
};

export default async function AccountsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const accounts = await apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Tài khoản & ví</h1>
      <form action={createAccount.bind(null, groupId)} className="flex flex-wrap items-end gap-2">
        <input name="name" required maxLength={100} placeholder="VD: TPBank chính" className={inputCls} />
        <select name="kind" defaultValue="bank" className={inputCls}>
          {Object.entries(KIND_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          name="provider"
          pattern="[a-z0-9_]*"
          maxLength={32}
          placeholder="provider: tpbank, momo…"
          className={inputCls}
        />
        <button className={btnCls}>Thêm</button>
      </form>

      <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {accounts.length === 0 && <li className="p-3 text-sm text-neutral-500">Chưa có tài khoản nào.</li>}
        {accounts.map((a) => (
          <li key={a.id} className={`flex flex-wrap items-center gap-3 p-3 ${a.archived ? "opacity-50" : ""}`}>
            <form action={renameAccount.bind(null, groupId, a.id)} className="flex gap-2">
              <input name="name" defaultValue={a.name} required maxLength={100} className={inputCls} />
              <button className={btnSecondaryCls}>Lưu</button>
            </form>
            <span className="text-sm text-neutral-500">
              {KIND_LABEL[a.kind]}
              {a.provider ? ` · ${a.provider}` : ""}
            </span>
            <form action={setAccountArchived.bind(null, groupId, a.id, !a.archived)} className="ml-auto">
              <button className={btnSecondaryCls}>{a.archived ? "Khôi phục" : "Lưu trữ"}</button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
