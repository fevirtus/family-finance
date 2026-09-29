"use client";

import { signIn } from "next-auth/react";
import { btnCls } from "@/lib/ui";

export function LoginButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button className={btnCls} onClick={() => signIn("google", { callbackUrl })}>
      Đăng nhập bằng Google
    </button>
  );
}
