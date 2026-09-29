import { apiFetch } from "@/lib/api";
import type { GroupDetail, Me } from "@/lib/types";
import { createInvite } from "./actions";
import { InviteLink } from "./invite-link";

export default async function SettingsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const [group, me] = await Promise.all([
    apiFetch<GroupDetail>(`/groups/${groupId}`),
    apiFetch<Me>("/me"),
  ]);
  const isOwner = group.members.some((m) => m.user_id === me.id && m.role === "owner");

  return (
    <section className="space-y-6">
      <h1 className="text-xl font-semibold">Cài đặt nhóm</h1>
      <div>
        <h2 className="mb-2 font-medium">Thành viên</h2>
        <ul className="divide-y rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
          {group.members.map((m) => (
            <li key={m.user_id} className="flex justify-between p-3 text-sm">
              <span>
                {m.name} <span className="text-neutral-500">({m.email})</span>
              </span>
              <span className="text-neutral-500">{m.role === "owner" ? "Chủ nhóm" : "Thành viên"}</span>
            </li>
          ))}
        </ul>
      </div>
      {isOwner && (
        <div>
          <h2 className="mb-2 font-medium">Mời thành viên</h2>
          <p className="mb-2 text-sm text-neutral-500">
            Email người được mời phải nằm trong danh sách cho phép (ALLOWED_EMAILS).
          </p>
          <InviteLink action={createInvite.bind(null, groupId)} />
        </div>
      )}
    </section>
  );
}
