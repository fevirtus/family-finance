"use server";

import { ApiError, apiFetch } from "@/lib/api";
import type { InviteOut } from "@/lib/types";

export async function createInvite(
  groupId: string,
): Promise<Partial<InviteOut> & { error?: string }> {
  try {
    return await apiFetch<InviteOut>(`/groups/${groupId}/invites`, { method: "POST" });
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e;
  }
}
