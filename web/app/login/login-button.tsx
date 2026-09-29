"use client";

import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function LoginButton({ callbackUrl }: { callbackUrl: string }) {
  return (
    <Button className="h-12 w-full text-base" onClick={() => signIn("google", { callbackUrl })}>
      Đăng nhập bằng Google
    </Button>
  );
}
