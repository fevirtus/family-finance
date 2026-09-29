"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Input } from "@/components/ui/input";
import type { Account, Category } from "@/lib/types";
import { cn } from "@/lib/utils";

type Picker = "account" | "category" | null;

export function TransactionFilters({
  accounts,
  categories,
}: {
  accounts: Account[];
  categories: Category[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [picker, setPicker] = useState<Picker>(null);
  const [q, setQ] = useState(params.get("q") ?? "");

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete("limit");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`${pathname}?${next}`);
  }

  const account = accounts.find((a) => a.id === params.get("account_id"));
  const category = categories.find((c) => c.id === params.get("category_id"));
  const uncategorized = params.get("uncategorized") === "1";

  const chip = (label: string, active: boolean, onClick: () => void, onClear?: () => void) => (
    <span
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center rounded-full border text-sm",
        active && "border-foreground bg-foreground text-background",
      )}
    >
      <button type="button" onClick={onClick} className="px-3 py-1.5">
        {label}
      </button>
      {active && onClear && (
        <button type="button" aria-label={`Bỏ lọc ${label}`} onClick={onClear} className="pr-2">
          <X className="size-4" />
        </button>
      )}
    </span>
  );

  const options: { id: string; name: string; icon?: string | null; archived: boolean }[] =
    picker === "account" ? accounts : categories;

  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: q.trim() || null });
        }}
        className="relative"
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm giao dịch…"
          maxLength={100}
          enterKeyHint="search"
          className="h-11 pl-9"
        />
      </form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chip(
          account?.name ?? "Tài khoản",
          Boolean(account),
          () => setPicker("account"),
          () => update({ account_id: null }),
        )}
        {chip(
          category ? `${category.icon ?? ""} ${category.name}` : "Danh mục",
          Boolean(category),
          () => setPicker("category"),
          () => update({ category_id: null }),
        )}
        {chip("Chưa phân loại", uncategorized, () =>
          update({ uncategorized: uncategorized ? null : "1", category_id: null }),
        )}
      </div>

      <ResponsiveSheet
        open={picker !== null}
        onOpenChange={(open) => !open && setPicker(null)}
        title={picker === "account" ? "Chọn tài khoản" : "Chọn danh mục"}
      >
        <div className="grid gap-1 pb-2">
          {options.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                update(
                  picker === "account"
                    ? { account_id: item.id }
                    : { category_id: item.id, uncategorized: null },
                );
                setPicker(null);
              }}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted"
            >
              {picker === "category" && <span className="text-lg">{item.icon ?? "🏷️"}</span>}
              <span className={cn(item.archived && "text-muted-foreground")}>{item.name}</span>
            </button>
          ))}
        </div>
      </ResponsiveSheet>
    </div>
  );
}
