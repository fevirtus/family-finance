import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(`API ${status}: ${detail}`);
  }
}

function describeDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : String(d)))
      .join("; ");
  }
  return JSON.stringify(detail);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getServerSession(authOptions);
  if (!session?.apiToken) redirect("/login");

  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.apiToken}`,
      ...init.headers,
    },
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = describeDetail((await res.json()).detail);
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
