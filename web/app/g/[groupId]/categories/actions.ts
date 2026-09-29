"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api";

export async function createCategory(groupId: string, formData: FormData): Promise<void> {
  const icon = String(formData.get("icon") ?? "").trim();
  await apiFetch(`/groups/${groupId}/categories`, {
    method: "POST",
    body: JSON.stringify({
      name: String(formData.get("name") ?? "").trim(),
      kind: String(formData.get("kind")),
      icon: icon || null,
    }),
  });
  revalidatePath(`/g/${groupId}/categories`);
}

export async function renameCategory(
  groupId: string,
  categoryId: string,
  formData: FormData,
): Promise<void> {
  const icon = String(formData.get("icon") ?? "").trim();
  await apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: String(formData.get("name") ?? "").trim(), icon: icon || null }),
  });
  revalidatePath(`/g/${groupId}/categories`);
}

export async function setCategoryArchived(
  groupId: string,
  categoryId: string,
  archived: boolean,
  _formData?: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived }),
  });
  revalidatePath(`/g/${groupId}/categories`);
}
