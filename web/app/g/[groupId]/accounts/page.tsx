import { apiFetch } from "@/lib/api";
import type { Account } from "@/lib/types";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const accounts = await apiFetch<Account[]>(`/groups/${groupId}/accounts?include_archived=true`);
  return <AccountsView groupId={groupId} accounts={accounts} />;
}
