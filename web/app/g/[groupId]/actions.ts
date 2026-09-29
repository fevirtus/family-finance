"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";
import type { ActionResult, Transaction, TransactionInput, TransactionPatch } from "@/lib/types";

async function run<T>(
  groupId: string,
  call: () => Promise<T>,
): Promise<{ value?: T; error?: string }> {
  try {
    const value = await call();
    revalidatePath(`/g/${groupId}`, "layout");
    return { value };
  } catch (e) {
    if (e instanceof ApiError) return { error: e.detail };
    throw e; // includes Next.js redirects
  }
}

export async function createTransaction(
  groupId: string,
  input: TransactionInput,
): Promise<ActionResult> {
  const { value, error } = await run(groupId, () =>
    apiFetch<Transaction>(`/groups/${groupId}/transactions`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  );
  return error ? { error } : { id: value?.id };
}

export async function updateTransaction(
  groupId: string,
  transactionId: string,
  patch: TransactionPatch,
): Promise<ActionResult> {
  const { error } = await run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions/${transactionId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    }),
  );
  return error ? { error } : {};
}

export async function deleteTransaction(
  groupId: string,
  transactionId: string,
): Promise<ActionResult> {
  const { error } = await run(groupId, () =>
    apiFetch(`/groups/${groupId}/transactions/${transactionId}`, { method: "DELETE" }),
  );
  return error ? { error } : {};
}
