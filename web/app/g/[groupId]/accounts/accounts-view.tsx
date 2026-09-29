"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ResponsiveSheet } from "@/components/responsive-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account, AccountKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { saveAccount, setAccountArchived } from "./actions";

const KINDS: { kind: AccountKind; label: string; icon: string }[] = [
  { kind: "bank", label: "Ngân hàng", icon: "🏦" },
  { kind: "ewallet", label: "Ví điện tử", icon: "👛" },
  { kind: "cash", label: "Tiền mặt", icon: "💵" },
  { kind: "credit", label: "Thẻ tín dụng", icon: "💳" },
];
const kindInfo = (kind: AccountKind) => KINDS.find((k) => k.kind === kind) ?? KINDS[0];

export function AccountsView({ groupId, accounts }: { groupId: string; accounts: Account[] }) {
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  const card = (a: Account) => (
    <button
      key={a.id}
      type="button"
      onClick={() => setEditing(a)}
      className={cn(
        "flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card px-4 text-left shadow-sm",
        a.archived && "opacity-60",
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-xl">
        {kindInfo(a.kind).icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{a.name}</span>
        <span className="block text-xs text-muted-foreground">
          {kindInfo(a.kind).label}
          {a.provider ? ` · ${a.provider}` : ""}
        </span>
      </span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tài khoản</h1>
        <Button onClick={() => setEditing("new")}>
          <Plus /> Thêm
        </Button>
      </div>
      {active.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Chưa có tài khoản — thêm TPBank, MoMo, Tiền mặt… để bắt đầu.
        </p>
      )}
      <div className="grid gap-2">{active.map(card)}</div>
      {archived.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="min-h-10 text-sm text-muted-foreground"
          >
            {showArchived ? "Ẩn" : "Hiện"} {archived.length} tài khoản đã lưu trữ
          </button>
          {showArchived && <div className="grid gap-2">{archived.map(card)}</div>}
        </div>
      )}
      <ResponsiveSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === "new" ? "Thêm tài khoản" : "Sửa tài khoản"}
      >
        {editing !== null && (
          <AccountForm
            key={editing === "new" ? "new" : editing.id}
            groupId={groupId}
            account={editing === "new" ? null : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </ResponsiveSheet>
    </div>
  );
}

function AccountForm({
  groupId,
  account,
  onDone,
}: {
  groupId: string;
  account: Account | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(account?.name ?? "");
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "bank");
  const [provider, setProvider] = useState(account?.provider ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveAccount(groupId, account?.id ?? null, {
        name: name.trim(),
        kind,
        provider: provider.trim().toLowerCase() || null,
      });
      if (result.error) setError(result.error);
      else {
        toast.success(account ? "Đã lưu tài khoản" : "Đã thêm tài khoản");
        onDone();
      }
    });
  }

  function toggleArchive() {
    if (!account) return;
    startTransition(async () => {
      const result = await setAccountArchived(groupId, account.id, !account.archived);
      if (result.error) setError(result.error);
      else {
        toast.success(account.archived ? "Đã khôi phục" : "Đã lưu trữ");
        onDone();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-2">
      <div className="space-y-2">
        <Label htmlFor="account-name">Tên</Label>
        <Input
          id="account-name"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: TPBank chính"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            aria-pressed={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-xl bg-muted px-3 text-sm",
              kind === k.kind && "ring-2 ring-primary",
            )}
          >
            {k.icon} {k.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Label htmlFor="account-provider">Mã nhà cung cấp (tuỳ chọn)</Label>
        <Input
          id="account-provider"
          maxLength={32}
          pattern="[a-z0-9_]*"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="tpbank, momo, zalopay…"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        Lưu
      </Button>
      {account && (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={toggleArchive}
          disabled={pending}
        >
          {account.archived ? "Khôi phục" : "Lưu trữ"}
        </Button>
      )}
    </form>
  );
}
