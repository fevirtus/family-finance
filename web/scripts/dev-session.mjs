// Dev only: mint a next-auth session cookie for the local web app.
// Usage (from web/): node --env-file=.env.local scripts/dev-session.mjs <api-jwt>
import { encode } from "next-auth/jwt";

const [apiToken] = process.argv.slice(2);
const secret = process.env.NEXTAUTH_SECRET;
const url = process.env.NEXTAUTH_URL ?? "";

if (!apiToken || !secret) {
  console.error("usage: node --env-file=.env.local scripts/dev-session.mjs <api-jwt>");
  process.exit(1);
}
if (!url.startsWith("http://localhost")) {
  console.error(`Refusing: NEXTAUTH_URL must be http://localhost…, got ${url}`);
  process.exit(1);
}

const maxAge = 7 * 24 * 60 * 60;
const cookie = await encode({
  token: {
    name: "Dev",
    email: "dev@example.com",
    apiToken,
    apiTokenExpires: Date.now() + maxAge * 1000,
  },
  secret,
  maxAge,
});
console.log(cookie);
