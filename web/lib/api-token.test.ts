import type { JWT } from "next-auth/jwt";
import { describe, expect, it } from "vitest";
import { usableApiToken } from "./api-token";

describe("usableApiToken", () => {
  const now = Date.parse("2026-09-29T00:00:00Z");

  it("returns the token while it is not expired", () => {
    const jwt = { apiToken: "t", apiTokenExpires: now + 1 } as JWT;
    expect(usableApiToken(jwt, now)).toBe("t");
  });

  it("returns undefined for expired, missing or malformed tokens", () => {
    expect(usableApiToken({ apiToken: "t", apiTokenExpires: now } as JWT, now)).toBeUndefined();
    expect(usableApiToken({ apiToken: "t" } as JWT, now)).toBeUndefined();
    expect(usableApiToken({} as JWT, now)).toBeUndefined();
    expect(usableApiToken(null, now)).toBeUndefined();
  });
});
