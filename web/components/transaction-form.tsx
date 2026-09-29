"use client";

import { ChevronDown, ChevronLeft } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatVnd, parseVnd } from "@/lib/money";
import { nowVnLocalInput, toVnLocalInput, vnLocalInputToIso } from "@/lib/time";
import type {
  Account,
  ActionResult,
  Category,
  Suggestions,
  Transaction,
  TransactionInput,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type Kind = "expense" | "income";

export const AMOUNT_CHIPS: [string, number][] = [
  ["20k", 20_000],
  ["50k", 50_000],
  ["100k", 100_000],
  ["200k", 200_000],
  ["500k", 500_000],
];

export const ACCOUNT_ICON: Record<Account["kind"], string> = {
  bank: "🏦",
  ewallet: "👛",
  cash: "💵",
  credit: "💳",
};

type Props = {
  accounts: Account[];
  categories: Category[];
  suggestions: Suggestions;
  defaultAccountId: string | null;
  initial?: Transaction;
  onSubmit: (input: TransactionInput) => Promise<ActionResult>;
  onDelete?: () => Promise<ActionResult>;
  onNeedAccount?: () => void;
};

export function TransactionForm({
  accounts,
  categories,
  suggestions,
  defaultAccountId,
  initial,
  onSubmit,
  onDelete,
  onNeedAccount,
}: Props) {
  const id = useId();
  const usableAccounts = accounts.filter((a) => !a.archived || a.id === initial?.account_id);
  const firstAccount =
    usableAccounts.find((a) => a.id === (initial?.account_id ?? defaultAccountId)) ??
    usableAccounts[0];

  const [kind, setKind] = useState<Kind>(initial && initial.amount > 0 ? "income" : "expense");
  const [amountText, setAmountText] = useState(initial ? String(Math.abs(initial.amount)) : "");
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null);
  const [accountId, setAccountId] = useState(firstAccount?.id ?? "");
  const [occurredLocal, setOccurredLocal] = useState(
    initial ? toVnLocalInput(initial.occurred_at) : nowVnLocalInput(),
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [panel, setPanel] = useState<"grid" | "categories" | "accounts">("grid");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const kindCategories = useMemo(
    () => categories.filter((c) => c.kind === kind && (!c.archived || c.id === initial?.category_id)),
    [categories, kind, initial?.category_id],
  );
  const gridCategories = useMemo(() => {
    const byId = new Map(kindCategories.map((c) => [c.id, c]));
    const ids =
      kind === "expense" ? suggestions.expense_category_ids : suggestions.income_category_ids;
    const grid = ids
      .map((cid) => byId.get(cid))
      .filter((c): c is Category => Boolean(c))
      .slice(0, 8);
    const selected = categoryId ? byId.get(categoryId) : undefined;
    if (selected && !grid.some((c) => c.id === selected.id)) {
      grid.splice(Math.min(grid.length, 7), grid.length, selected);
    }
    return grid;
  }, [kindCategories, suggestions, kind, categoryId]);

  const parsed = parseVnd(amountText);
  const account = usableAccounts.find((a) => a.id === accountId);

  if (usableAccounts.length === 0) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">Bạn cần thêm tài khoản trước</p>
        <Button onClick={onNeedAccount}>Thêm tài khoản</Button>
      </div>
    );
  }

  function switchKind(next: Kind) {
    setKind(next);
    const current = categories.find((c) => c.id === categoryId);
    if (current && current.kind !== next) setCategoryId(null);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsed || parsed <= 0) {
      setError("Số tiền không hợp lệ");
      return;
    }
    let occurredAt: string;
    try {
      occurredAt = vnLocalInputToIso(occurredLocal);
    } catch {
      setError("Thời gian không hợp lệ");
      return;
    }
    const input: TransactionInput = {
      account_id: accountId,
      amount: kind === "expense" ? -parsed : parsed,
      occurred_at: occurredAt,
      description: description.trim(),
      category_id: categoryId,
      note: note.trim() || null,
    };
    setError(null);
    startTransition(async () => {
      const result = await onSubmit(input);
      if (result.error) setError(result.error);
    });
  }

  function handleDelete() {
    if (!onDelete) return;
    startTransition(async () => {
      const result = await onDelete();
      if (result.error) setError(result.error);
      setConfirmOpen(false);
    });
  }

  const tile = (c: Category) => (
    <button
      key={c.id}
      type="button"
      aria-pressed={categoryId === c.id}
      onClick={() => {
        setCategoryId(categoryId === c.id ? null : c.id);
        setPanel("grid");
      }}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-muted px-1 py-2 text-xs",
        categoryId === c.id && "bg-primary/15 ring-2 ring-primary",
      )}
    >
      <span className="text-xl leading-none">{c.icon ?? "🏷️"}</span>
      <span className="line-clamp-1">{c.name}</span>
    </button>
  );

  const back = (
    <Button type="button" variant="ghost" size="sm" onClick={() => setPanel("grid")}>
      <ChevronLeft /> Quay lại
    </Button>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {(["expense", "income"] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => switchKind(k)}
            className={cn(
              "min-h-10 rounded-md text-sm font-medium",
              kind === k && "bg-background shadow-sm",
              kind === k && (k === "expense" ? "text-red-600" : "text-emerald-600"),
            )}
          >
            {k === "expense" ? "Chi" : "Thu"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-amount`}>Số tiền</Label>
        <Input
          id={`${id}-amount`}
          inputMode="decimal"
          autoComplete="off"
          autoFocus={!initial}
          placeholder="45k, 1tr2, 1.200.000"
          value={amountText}
          onChange={(e) => setAmountText(e.target.value)}
          className={cn(
            "h-14 text-2xl font-semibold tabular-nums",
            kind === "expense" ? "text-red-600" : "text-emerald-600",
          )}
        />
        {parsed ? (
          <p className="text-sm tabular-nums text-muted-foreground">= {formatVnd(parsed)}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {AMOUNT_CHIPS.map(([label, value]) => (
            <button
              key={label}
              type="button"
              onClick={() => setAmountText(String(value))}
              className="min-h-9 rounded-full border px-3 text-sm"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {panel === "categories" ? (
        <div className="space-y-2">
          {back}
          <div className="grid grid-cols-4 gap-2">{kindCategories.map(tile)}</div>
        </div>
      ) : panel === "accounts" ? (
        <div className="space-y-2">
          {back}
          <div className="grid gap-2">
            {usableAccounts.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={a.id === accountId}
                onClick={() => {
                  setAccountId(a.id);
                  setPanel("grid");
                }}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-xl bg-muted px-3 text-left text-sm",
                  a.id === accountId && "ring-2 ring-primary",
                )}
              >
                <span className="text-lg">{ACCOUNT_ICON[a.kind]}</span>
                {a.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {gridCategories.map(tile)}
          <button
            type="button"
            aria-label="Khác…"
            onClick={() => setPanel("categories")}
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs"
          >
            <span className="text-xl leading-none">⋯</span>
            Khác…
          </button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>Mô tả</Label>
        <Input
          id={`${id}-description`}
          maxLength={500}
          placeholder="VD: phở bò"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label="Tài khoản"
          onClick={() => setPanel(panel === "accounts" ? "grid" : "accounts")}
          className="flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm"
        >
          {account ? `${ACCOUNT_ICON[account.kind]} ${account.name}` : "Chọn tài khoản"}
          <ChevronDown className="size-4" />
        </button>
        <Label htmlFor={`${id}-time`} className="sr-only">
          Thời gian
        </Label>
        <Input
          id={`${id}-time`}
          type="datetime-local"
          value={occurredLocal}
          onChange={(e) => setOccurredLocal(e.target.value)}
          suppressHydrationWarning
          className="min-h-11 w-auto rounded-full"
        />
      </div>

      {initial && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-note`}>Ghi chú</Label>
          <Textarea
            id={`${id}-note`}
            maxLength={2000}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
        {initial ? "Lưu thay đổi" : "Lưu"}
      </Button>

      {initial && onDelete && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="w-full text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            Xoá giao dịch
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xoá giao dịch {formatVnd(initial.amount)}?</AlertDialogTitle>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Huỷ</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} disabled={pending}>
                  Xoá
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </form>
  );
}
