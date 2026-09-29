import { ChevronRight, Tags, Users } from "lucide-react";
import Link from "next/link";
import { SignOutRow } from "./sign-out-row";

export default async function MorePage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const items = [
    { href: `/g/${groupId}/more/categories`, label: "Danh mục", icon: Tags },
    { href: `/g/${groupId}/more/group`, label: "Nhóm & thành viên", icon: Users },
  ];
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Thêm</h1>
      <div className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex min-h-14 items-center gap-3 px-4 hover:bg-muted/60"
          >
            <item.icon className="size-5 text-muted-foreground" />
            <span className="flex-1">{item.label}</span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
        <SignOutRow />
      </div>
    </div>
  );
}
