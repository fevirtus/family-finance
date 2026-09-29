"use server";

import { apiFetch } from "@/lib/api";
import type { InviteOut } from "@/lib/types";

export async function createInvite(groupId: string): Promise<InviteOut> {
  return apiFetch<InviteOut>(`/groups/${groupId}/invites`, { method: "POST" });
}
