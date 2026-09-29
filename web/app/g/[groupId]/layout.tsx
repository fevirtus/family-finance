import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { apiFetch } from "@/lib/api";
import type { Account, Category, Me, Suggestions } from "@/lib/types";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const me = await apiFetch<Me>("/me");
  const group = me.groups.find((g) => g.id === groupId);
  if (!group) notFound();

  const [accounts, categories, suggestions] = await Promise.all([
    apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`),
    apiFetch<Category[]>(`/groups/${groupId}/categories?include_archived=true`),
    apiFetch<Suggestions>(`/groups/${groupId}/suggestions`),
  ]);

  return (
    <AppShell
      groupId={groupId}
      groupName={group.name}
      accounts={accounts}
      categories={categories}
      suggestions={suggestions}
    >
      {children}
    </AppShell>
  );
}
