"use client";

import { signIn } from "next-auth/react";
import { buttonVariants } from "@/components/ui/button";
const btnCls = buttonVariants();
const inputCls = "h-10 rounded-md border px-3 text-sm";

export function LoginButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <button className={btnCls} onClick={() => signIn("google", { callbackUrl })}>
      Đăng nhập bằng Google
    </button>
  );
}
