"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { AccountKind, ActionResult } from "@/lib/types";

export type AccountData = { name: string; kind: AccountKind; provider: string | null };

async function run(groupId: string, call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e;
  }
  revalidatePath(`/g/${groupId}`, "layout");
  return {};
}

export async function saveAccount(
  groupId: string,
  accountId: string | null,
  data: AccountData,
): Promise<ActionResult> {
  return run(groupId, () =>
    apiFetch(
      accountId ? `/groups/${groupId}/accounts/${accountId}` : `/groups/${groupId}/accounts`,
      { method: accountId ? "PATCH" : "POST", body: JSON.stringify(data) },
    ),
  );
}

export async function setAccountArchived(
  groupId: string,
  accountId: string,
  archived: boolean,
): Promise<ActionResult> {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/accounts/${accountId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    }),
  );
}
