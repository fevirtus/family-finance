"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { ActionResult, TransactionInput } from "@/lib/types";

async function run(groupId: string, call: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await call();
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e; // includes Next.js redirects
  }
  revalidatePath(`/g/${groupId}/transactions`);
  return {};
}

export async function createTransaction(
  groupId: string,
  input: TransactionInput,
): Promise<ActionResult> {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions`, { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function updateTransaction(
  groupId: string,
  transactionId: string,
  input: TransactionInput,
): Promise<ActionResult> {
  return run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  );
}

export async function deleteTransaction(
  groupId: string,
  transactionId: string,
  _formData?: FormData,
): Promise<void> {
  await apiFetch(`/groups/${groupId}/transactions/${transactionId}`, { method: "DELETE" });
  revalidatePath(`/g/${groupId}/transactions`);
}
