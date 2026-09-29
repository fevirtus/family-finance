"use client";

import { Home, List, LogOut, MoreHorizontal, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEMS = [
  { segment: "overview", label: "Tổng quan", icon: Home },
  { segment: "transactions", label: "Giao dịch", icon: List },
  { segment: "accounts", label: "Tài khoản", icon: Wallet },
  { segment: "more", label: "Thêm", icon: MoreHorizontal },
] as const;

function useActive(groupId: string) {
  const pathname = usePathname();
  return (segment: string) => pathname.startsWith(`/g/${groupId}/${segment}`);
}

export function BottomNav({ groupId, onAdd }: { groupId: string; onAdd: () => void }) {
  const isActive = useActive(groupId);
  const link = (item: (typeof ITEMS)[number]) => (
    <Link
      key={item.segment}
      href={`/g/${groupId}/${item.segment}`}
      className={cn(
        "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]",
        isActive(item.segment) ? "text-primary" : "text-muted-foreground",
      )}
    >
      <item.icon className="size-5" />
      {item.label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-lg items-end">
        {link(ITEMS[0])}
        {link(ITEMS[1])}
        <div className="flex flex-1 justify-center">
          <button
            type="button"
            aria-label="Thêm giao dịch"
            onClick={onAdd}
            className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95"
          >
            <Plus className="size-7" />
          </button>
        </div>
        {link(ITEMS[2])}
        {link(ITEMS[3])}
      </div>
    </nav>
  );
}

export function SideNav({
  groupId,
  groupName,
  onAdd,
}: {
  groupId: string;
  groupName: string;
  onAdd: () => void;
}) {
  const isActive = useActive(groupId);
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-2 border-r p-4 md:flex">
      <div className="px-2 pb-2 text-lg font-semibold">{groupName}</div>
      <Button onClick={onAdd} className="mb-2 justify-start">
        <Plus /> Thêm giao dịch
      </Button>
      {ITEMS.map((item) => (
        <Link
          key={item.segment}
          href={`/g/${groupId}/${item.segment}`}
          className={cn(
            "flex min-h-10 items-center gap-3 rounded-md px-3 text-sm",
            isActive(item.segment)
              ? "bg-muted font-medium"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          <item.icon className="size-4" />
          {item.label}
        </Link>
      ))}
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="mt-auto flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted"
      >
        <LogOut className="size-4" /> Đăng xuất
      </button>
    </aside>
  );
}
