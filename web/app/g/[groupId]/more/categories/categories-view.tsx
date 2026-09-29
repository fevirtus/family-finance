"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
import { saveCategory, setCategoryArchived } from "./actions";

type Kind = Category["kind"];

export function CategoriesView({ groupId, categories }: { groupId: string; categories: Category[] }) {
  const [kind, setKind] = useState<Kind>("expense");
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const list = categories.filter((c) => c.kind === kind);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Danh mục</h1>
        <Button onClick={() => setEditing("new")}>
          <Plus /> Thêm
        </Button>
      </div>
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "min-h-10 rounded-md text-sm font-medium",
              kind === k && "bg-background shadow-sm",
            )}
          >
            {k === "expense" ? "Chi" : "Thu"}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setEditing(c)}
            className={cn(
              "flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border bg-card p-2 text-sm shadow-sm",
              c.archived && "opacity-50",
            )}
          >
            <span className="text-2xl">{c.icon ?? "🏷️"}</span>
            <span className="line-clamp-1">{c.name}</span>
          </button>
        ))}
      </div>
      <ResponsiveSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Thêm danh mục" : "Sửa danh mục"}
      >
        {editing !== null && (
          <CategoryForm
            key={editing === "new" ? "new" : editing.id}
            groupId={groupId}
            category={editing === "new" ? null : editing}
            kind={kind}
            onDone={() => setEditing(null)}
          />
        )}
      </ResponsiveSheet>
    </div>
  );
}

function CategoryForm({
  groupId,
  category,
  kind,
  onDone,
}: {
  groupId: string;
  category: Category | null;
  kind: Kind;
  onDone: () => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCategory(groupId, category?.id ?? null, {
        name: name.trim(),
        kind: category?.kind ?? kind,
        icon: icon.trim() || null,
      });
      if (result.error) setError(result.error);
      else {
        toast.success("Đã lưu danh mục");
        onDone();
      }
    });
  }

  function toggleArchive() {
    if (!category) return;
    startTransition(async () => {
      const result = await setCategoryArchived(groupId, category.id, !category.archived);
      if (result.error) setError(result.error);
      else {
        toast.success(category.archived ? "Đã hiện lại" : "Đã ẩn");
        onDone();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2">
      <div className="flex gap-2">
        <div className="w-20 space-y-2">
          <Label htmlFor="category-icon">Icon</Label>
          <Input
            id="category-icon"
            maxLength={16}
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="☕"
            className="text-center text-xl"
          />
        </div>
        <div className="flex-1 space-y-2">
          <Label htmlFor="category-name">Tên</Label>
          <Input
            id="category-name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        Lưu
      </Button>
      {category && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={toggleArchive}
          disabled={pending}
        >
          {category.archived ? "Hiện lại" : "Ẩn danh mục"}
        </Button>
      )}
    </form>
  );
}
