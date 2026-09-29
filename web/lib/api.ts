import "server-only";
import { getToken } from "next-auth/jwt";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { usableApiToken } from "@/lib/api-token";

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

/** Read the API token from the next-auth cookie on the server; never exposed to the browser. */
export async function getApiToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const jwt = await getToken({
    req: {
      cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])),
      headers: {},
    } as unknown as Parameters<typeof getToken>[0]["req"],
  });
  return usableApiToken(jwt);
}

/** Login URL that returns to the current page (same-origin paths only). */
export async function loginUrl(): Promise<string> {
  const path = (await headers()).get("x-pathname") ?? "/";
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/";
  return `/login?callbackUrl=${encodeURIComponent(safe)}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const apiToken = await getApiToken();
  if (!apiToken) redirect(await loginUrl());

  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
      ...init.headers,
    },
  });
  if (res.status === 401) redirect(await loginUrl());
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
