import { apiFetch } from "@/lib/api";
import type { Category } from "@/lib/types";
import { btnCls, btnSecondaryCls, inputCls } from "@/lib/ui";
import { createCategory, renameCategory, setCategoryArchived } from "./actions";

const SECTIONS: [Category["kind"], string][] = [
  ["expense", "Chi"],
  ["income", "Thu"],
];

export default async function CategoriesPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const categories = await apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`);

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Danh mục</h1>
      <form action={createCategory.bind(null, groupId)} className="flex flex-wrap items-end gap-2">
        <input name="icon" maxLength={16} placeholder="☕" className={`${inputCls} w-16`} />
        <input name="name" required maxLength={100} placeholder="Tên danh mục" className={inputCls} />
        <select name="kind" defaultValue="expense" className={inputCls}>
          <option value="expense">Chi</option>
          <option value="income">Thu</option>
        </select>
        <button className={btnCls}>Thêm</button>
      </form>

      <div className="grid gap-6 md:grid-cols-2">
        {SECTIONS.map(([kind, title]) => (
          <div key={kind}>
            <h2 className="mb-2 font-medium">{title}</h2>
            <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              {categories
                .filter((c) => c.kind === kind)
                .map((c) => (
                  <li key={c.id} className={`flex items-center gap-2 p-2 ${c.archived ? "opacity-50" : ""}`}>
                    <form action={renameCategory.bind(null, groupId, c.id)} className="flex flex-1 gap-2">
                      <input name="icon" defaultValue={c.icon ?? ""} maxLength={16} className={`${inputCls} w-14`} />
                      <input name="name" defaultValue={c.name} required maxLength={100} className={`${inputCls} flex-1`} />
                      <button className={btnSecondaryCls}>Lưu</button>
                    </form>
                    <form action={setCategoryArchived.bind(null, groupId, c.id, !c.archived)}>
                      <button className={btnSecondaryCls}>{c.archived ? "Khôi phục" : "Ẩn"}</button>
                    </form>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
