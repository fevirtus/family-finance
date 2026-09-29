"use client";

import { signOut } from "next-auth/react";
import { btnSecondaryCls } from "@/lib/ui";

export function SignOutButton() {
  return (
    <button className={btnSecondaryCls} onClick={() => signOut({ callbackUrl: "/login" })}>
      Đăng xuất
    </button>
  );
}
