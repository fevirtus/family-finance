import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

type ApiLogin = { access_token: string; expires_at: string };

async function exchangeGoogleToken(idToken: string): Promise<ApiLogin> {
  const res = await fetch(`${process.env.API_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`API login failed with status ${res.status}`);
  return res.json();
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    async jwt({ token, account }) {
      // Only on sign-in: the API is the source of truth for the email allowlist.
      if (account?.id_token) {
        const login = await exchangeGoogleToken(account.id_token);
        token.apiToken = login.access_token;
        token.apiTokenExpires = Date.parse(login.expires_at);
      }
      return token;
    },
    // No session callback on purpose: /api/auth/session is readable by browser JS, so the
    // API token stays in the encrypted JWT cookie and is read server-side (lib/api.ts).
  },
};
