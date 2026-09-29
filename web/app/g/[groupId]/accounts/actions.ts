"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createAccount(groupId: string, formData: FormData): Promise<void> {
  const provider = String(formData.get("provider") ?? "").trim();
  await apiFetch(`/groups/${groupId}/accounts`, {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      kind: String(formData.get("kind")),
      provider: provider || null,
    }),
  });
  revalidatePath(`/g/${groupId}/accounts`);
}

export async function renameAccount(
  groupId: string,
  accountId: string,
  formData: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: String(formData.get("name") ?? "").trim() }),
  });
  revalidatePath(`/g/${groupId}/accounts`);
}

export async function setAccountArchived(
  groupId: string,
  accountId: string,
  archived: boolean,
  _formData?: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
  revalidatePath(`/g/${groupId}/accounts`);
}
