import { apiFetch } from "@/lib/api";
import type { GroupDetail, Me } from "@/lib/types";
import { InviteLink } from "./invite-link";

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [group, me] = await Promise.all([
    apiFetch<GroupDetail>(`/groups/${groupId}`),
    apiFetch<Me>("/me"),
  ]);
  const isOwner = group.members.some((m) => m.user_id === me.id && m.role === "owner");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{group.name}</h1>
      <section className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
        {group.members.map((m) => (
          <div key={m.user_id} className="flex min-h-14 items-center gap-3 px-4">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
              {m.name.slice(0, 1).toUpperCase() || "?"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{m.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{m.email}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {m.role === "owner" ? "Chủ nhóm" : "Thành viên"}
            </span>
          </div>
        ))}
      </section>
      {isOwner && (
        <section className="space-y-2">
          <h2 className="font-semibold">Mời thành viên</h2>
          <InviteLink groupId={groupId} />
        </section>
      )}
    </div>
  );
}
