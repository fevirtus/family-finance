"use client";

import { Copy, Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVnDateTime } from "@/lib/time";
import type { InviteOut } from "@/lib/types";
import { createInvite } from "./actions";

export function InviteLink({ groupId }: { groupId: string }) {
  const [invite, setInvite] = useState<InviteOut | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      const result = await createInvite(groupId);
      if (result.error || !result.url || !result.expires_at) {
        toast.error(result.error ?? "Không tạo được link");
      } else {
        setInvite({ url: result.url, expires_at: result.expires_at });
      }
    });
  }

  async function copy() {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.url);
    toast.success("Đã sao chép link mời");
  }

  return (
    <div className="space-y-2">
      <Button onClick={generate} disabled={pending} variant={invite ? "outline" : "default"}>
        <Link2 /> {invite ? "Tạo link khác" : "Tạo link mời"}
      </Button>
      {invite && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <Input readOnly value={invite.url} onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="Sao chép">
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Dùng được 1 lần, hết hạn {formatVnDateTime(invite.expires_at)}. Email người được mời
            phải nằm trong danh sách cho phép.
          </p>
        </div>
      )}
    </div>
  );
}
