"use client";

import { btnSecondaryCls } from "@/lib/ui";

export default function GroupError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-3 rounded-md bg-red-50 p-4 text-sm text-red-700">
      <p>Đã có lỗi xảy ra. Vui lòng thử lại.</p>
      <button className={btnSecondaryCls} onClick={reset}>
        Thử lại
      </button>
    </div>
  );
}
