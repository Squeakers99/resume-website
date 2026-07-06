import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      authorization: {
        params: {
          scope:
            "openid email profile https://www.googleapis.com/auth/calendar.events",
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return false;

      const allowed = process.env.ALLOWED_EMAIL?.toLowerCase();
      if (!allowed) return false;

      return (
        profile?.email_verified === true &&
        profile.email?.toLowerCase() === allowed
      );
    },
    // Keep Google OAuth tokens inside the encrypted JWT cookie (never on the
    // session object the browser can read) and refresh them when expired.
    async jwt({ token, account }) {
      if (account) {
        return {
          ...token,
          access_token: account.access_token,
          expires_at: account.expires_at,
          refresh_token: account.refresh_token ?? token.refresh_token,
        };
      }

      const expiresAt = typeof token.expires_at === "number" ? token.expires_at : 0;
      if (Date.now() < expiresAt * 1000 - 60_000) return token;
      if (typeof token.refresh_token !== "string") return token;

      try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: process.env.AUTH_GOOGLE_ID ?? "",
            client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
            grant_type: "refresh_token",
            refresh_token: token.refresh_token,
          }),
        });
        const refreshed = (await response.json()) as {
          access_token?: string;
          expires_in?: number;
          refresh_token?: string;
        };
        if (!response.ok || !refreshed.access_token) throw new Error("refresh failed");

        return {
          ...token,
          access_token: refreshed.access_token,
          expires_at: Math.floor(Date.now() / 1000) + (refreshed.expires_in ?? 3600),
          refresh_token: refreshed.refresh_token ?? token.refresh_token,
        };
      } catch {
        // Keep the user signed in; the calendar simply shows as disconnected.
        return { ...token, access_token: undefined };
      }
    },
  },
});

// Strict owner check for gating. Auth.js can surface config errors as a
// truthy non-session object, so gates must never rely on truthiness alone:
// anything without the allowed email is treated as signed out. Used by both
// getOwnerSession() and the /dashboard proxy gate.
export function isOwnerSession(session: Session | null): boolean {
  const allowed = process.env.ALLOWED_EMAIL?.toLowerCase();
  const email = session?.user?.email?.toLowerCase();
  return Boolean(allowed && email && email === allowed);
}

export async function getOwnerSession() {
  const session = await auth();
  return isOwnerSession(session) ? session : null;
}
