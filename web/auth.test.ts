import type { Session } from "next-auth";
import type { JWT } from "next-auth/jwt";
import { describe, expect, it } from "vitest";
import { authOptions } from "./auth";

type SessionParams = Parameters<NonNullable<NonNullable<typeof authOptions.callbacks>["session"]>>[0];

describe("session callback", () => {
  it("never exposes the API token to the browser-readable session", async () => {
    // next-auth's default session callback returns the session unchanged.
    const callback =
      authOptions.callbacks?.session ?? (async ({ session }: SessionParams) => session);
    const session = await callback({
      session: { expires: "2099-01-01T00:00:00Z", user: { email: "me@example.com" } } as Session,
      token: { apiToken: "secret-api-jwt", apiTokenExpires: Date.now() + 60_000 } as JWT,
    } as SessionParams);
    expect(JSON.stringify(session)).not.toContain("secret-api-jwt");
  });
});
