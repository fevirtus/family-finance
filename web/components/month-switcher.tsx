import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function href(basePath: string, month: string, extra: Record<string, string>) {
  const qs = new URLSearchParams({ ...extra, month });
  return `${basePath}?${qs}`;
}

export function MonthSwitcher({
  month,
  basePath,
  extraParams = {},
}: {
  month: string;
  basePath: string;
  extraParams?: Record<string, string>;
}) {
  const [y, m] = month.split("-");
  return (
    <div className="flex items-center justify-between">
      <Link
        href={href(basePath, shiftMonth(month, -1), extraParams)}
        aria-label="Tháng trước"
        className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
      >
        <ChevronLeft />
      </Link>
      <div className="text-base font-semibold">
        Tháng {Number(m)}/{y}
      </div>
      <Link
        href={href(basePath, shiftMonth(month, 1), extraParams)}
        aria-label="Tháng sau"
        className="flex size-11 items-center justify-center rounded-full hover:bg-muted"
      >
        <ChevronRight />
      </Link>
    </div>
  );
}
