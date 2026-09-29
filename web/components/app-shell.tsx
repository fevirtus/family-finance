"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Toaster, toast } from "sonner";
import { createTransaction, deleteTransaction, updateTransaction } from "@/app/g/[groupId]/actions";
import { BottomNav, SideNav } from "@/components/nav";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { TransactionForm } from "@/components/transaction-form";
import { changedFields } from "@/lib/diff";
import { formatVnd } from "@/lib/money";
import type {
  Account,
  ActionResult,
  Category,
  Suggestions,
  Transaction,
  TransactionInput,
} from "@/lib/types";

type SheetApi = { openCreate: () => void; openEdit: (t: Transaction) => void };

const SheetContext = createContext<SheetApi | null>(null);

export function useTransactionSheet(): SheetApi {
  const ctx = useContext(SheetContext);
  if (!ctx) throw new Error("useTransactionSheet must be used inside AppShell");
  return ctx;
}

type Props = {
  groupId: string;
  groupName: string;
  accounts: Account[];
  categories: Category[];
  suggestions: Suggestions;
  children: React.ReactNode;
};

type SheetState =
  | { mode: "create"; key: number }
  | { mode: "edit"; key: number; transaction: Transaction };

export function AppShell({ groupId, groupName, accounts, categories, suggestions, children }: Props) {
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const openCreate = useCallback(() => setSheet({ mode: "create", key: Date.now() }), []);
  const openEdit = useCallback(
    (transaction: Transaction) => setSheet({ mode: "edit", key: Date.now(), transaction }),
    [],
  );
  const api = useMemo(() => ({ openCreate, openEdit }), [openCreate, openEdit]);

  function label(input: TransactionInput): string {
    const category = categories.find((c) => c.id === input.category_id);
    const amount = formatVnd(input.amount);
    return category ? `${amount} · ${category.icon ?? ""} ${category.name}` : amount;
  }

  async function handleSubmit(input: TransactionInput): Promise<ActionResult> {
    if (sheet?.mode === "edit") {
      const patch = changedFields(sheet.transaction, input);
      if (Object.keys(patch).length === 0) {
        setSheet(null);
        return {};
      }
      const result = await updateTransaction(groupId, sheet.transaction.id, patch);
      if (!result.error) {
        setSheet(null);
        toast.success("Đã cập nhật");
      }
      return result;
    }
    const result = await createTransaction(groupId, input);
    if (!result.error) {
      setSheet(null);
      const createdId = result.id;
      toast.success(`Đã lưu ${label(input)}`, {
        action: createdId
          ? {
              label: "Hoàn tác",
              onClick: async () => {
                const undo = await deleteTransaction(groupId, createdId);
                if (undo.error) toast.error(undo.error);
                else toast("Đã hoàn tác");
              },
            }
          : undefined,
      });
    }
    return result;
  }

  async function handleDelete(): Promise<ActionResult> {
    if (sheet?.mode !== "edit") return {};
    const result = await deleteTransaction(groupId, sheet.transaction.id);
    if (!result.error) {
      setSheet(null);
      toast.success("Đã xoá giao dịch");
    }
    return result;
  }

  return (
    <SheetContext.Provider value={api}>
      <div className="md:flex">
        <SideNav groupId={groupId} groupName={groupName} onAdd={openCreate} />
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b bg-background/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
            <div className="text-sm font-semibold">{groupName}</div>
          </header>
          <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4 md:pb-10 md:pt-8">
            {children}
          </main>
        </div>
      </div>
      <BottomNav groupId={groupId} onAdd={openCreate} />
      <ResponsiveSheet
        open={sheet !== null}
        onOpenChange={(open) => !open && setSheet(null)}
        title={sheet?.mode === "edit" ? "Sửa giao dịch" : "Thêm giao dịch"}
      >
        {sheet && (
          <TransactionForm
            key={sheet.key}
            accounts={accounts}
            categories={categories}
            suggestions={suggestions}
            defaultAccountId={suggestions.last_account_id}
            initial={sheet.mode === "edit" ? sheet.transaction : undefined}
            onSubmit={handleSubmit}
            onDelete={sheet.mode === "edit" ? handleDelete : undefined}
            onNeedAccount={() => {
              setSheet(null);
              router.push(`/g/${groupId}/accounts`);
            }}
          />
        )}
      </ResponsiveSheet>
      <Toaster position="top-center" richColors theme="system" />
    </SheetContext.Provider>
  );
}
