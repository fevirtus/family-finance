"use client";

import { Button } from "@/components/ui/button";

export default function GroupError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <p>Đã có lỗi xảy ra. Vui lòng thử lại.</p>
      <Button variant="outline" onClick={reset}>
        Thử lại
      </Button>
    </div>
  );
}
