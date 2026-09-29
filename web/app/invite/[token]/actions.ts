"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { GroupSummary } from "@/lib/types";

export async function acceptInvite(token: string, _formData?: FormData): Promise<void> {
  const group = await apiFetch<GroupSummary>(`/invites/${encodeURIComponent(token)}/accept`, {
    method: "POST",
  });
  redirect(`/g/${group.id}/transactions`);
}
