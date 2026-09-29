"use client";

import { useActionState } from "react";
import { formatVnDateTime } from "@/lib/time";
import type { InviteOut } from "@/lib/types";
import { btnCls, inputCls } from "@/lib/ui";

export function InviteLink({ action }: { action: () => Promise<InviteOut> }) {
  const [invite, formAction, pending] = useActionState<InviteOut | null>(() => action(), null);

  return (
    <form action={formAction} className="space-y-2">
      <button className={btnCls} disabled={pending}>
        Tạo link mời
      </button>
      {invite && (
        <div className="space-y-1">
          <input
            readOnly
            value={invite.url}
            onFocus={(e) => e.currentTarget.select()}
            className={`${inputCls} w-full`}
          />
          <p className="text-xs text-neutral-500">
            Dùng được 1 lần, hết hạn {formatVnDateTime(invite.expires_at)}.
          </p>
        </div>
      )}
    </form>
  );
}
