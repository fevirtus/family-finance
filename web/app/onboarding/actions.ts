"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { GroupSummary } from "@/lib/types";

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const group = await apiFetch<GroupSummary>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, type: "family" }),
  });
  redirect(`/g/${group.id}/transactions`);
}
