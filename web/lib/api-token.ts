import type { JWT } from "next-auth/jwt";

/** The API bearer stored in the (encrypted, HttpOnly) next-auth JWT, if still valid. */
export function usableApiToken(jwt: JWT | null, now: number = Date.now()): string | undefined {
  if (!jwt?.apiToken || typeof jwt.apiTokenExpires !== "number") return undefined;
  return jwt.apiTokenExpires > now ? jwt.apiToken : undefined;
}
