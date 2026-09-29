"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { ActionResult, Category } from "@/lib/types";

export type CategoryData = { name: string; kind: Category["kind"]; icon: string | null };

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

export async function saveCategory(
  groupId: string,
  categoryId: string | null,
  data: CategoryData,
): Promise<ActionResult> {
  return run(groupId, () =>
    categoryId
      ? apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
          method: "PATCH",
          body: JSON.stringify({ name: data.name, icon: data.icon }),
        })
      : apiFetch(`/groups/${groupId}/categories`, { method: "POST", body: JSON.stringify(data) }),
  );
}

export async function setCategoryArchived(
  groupId: string,
  categoryId: string,
  archived: boolean,
): Promise<ActionResult> {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/categories/${categoryId}`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    }),
  );
}
