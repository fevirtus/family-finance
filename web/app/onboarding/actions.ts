"use server";

import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { GroupSummary } from "@/lib/types";
import { STARTER_ACCOUNTS } from "./presets";

export async function createGroup(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const chosen = new Set(formData.getAll("accounts").map(String));
  const group = await apiFetch<GroupSummary>("/groups", {
    method: "POST",
    body: JSON.stringify({ name, type: "family" }),
  });
  for (const preset of STARTER_ACCOUNTS.filter((p) => chosen.has(p.key))) {
    await apiFetch(`/groups/${group.id}/accounts`, {
      method: "POST",
      body: JSON.stringify({ name: preset.name, kind: preset.kind, provider: preset.provider }),
    });
  }
  redirect(`/g/${group.id}/overview`);
}
