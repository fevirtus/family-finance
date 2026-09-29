"use client";

import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

export function SignOutRow() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-destructive hover:bg-muted/60"
    >
      <LogOut className="size-5" /> Đăng xuất
    </button>
  );
}
