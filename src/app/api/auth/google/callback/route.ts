import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { createSession, setSessionCookie } from "@/lib/session";
import { clientIp } from "@/lib/security";

export const runtime = "nodejs";

const PKCE_COOKIE = "empire_google_pkce";

interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? url.origin;
  const fail = (q: string) => Response.redirect(`${appUrl}/login?error=${q}`, 302);

  const cfg = env.googleOAuth();
  if (!cfg) return fail("google-not-configured");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("google-missing-params");

  const store = await cookies();
  const pkceRaw = store.get(PKCE_COOKIE)?.value;
  store.delete(PKCE_COOKIE);
  if (!pkceRaw) return fail("google-state-missing");

  let pkce: { verifier: string; state: string };
  try {
    pkce = JSON.parse(pkceRaw);
  } catch {
    return fail("google-state-invalid");
  }
  if (pkce.state !== state) return fail("google-state-mismatch");

  // Exchange code (with PKCE verifier) for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      code_verifier: pkce.verifier,
      grant_type: "authorization_code",
      redirect_uri: `${appUrl}/api/auth/google/callback`,
    }),
  });
  if (!tokenRes.ok) return fail("google-token-exchange");
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) return fail("google-no-access-token");

  const infoRes = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { Authorization: `Bearer ${tokens.access_token}` } },
  );
  if (!infoRes.ok) return fail("google-userinfo");
  const info = (await infoRes.json()) as GoogleUserInfo;
  if (!info.sub || !info.email) return fail("google-incomplete-profile");

  const db = getDb();
  if (!db) return fail("setup-required");

  const email = info.email.toLowerCase();
  const existing = await db.oAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "google",
        providerAccountId: info.sub,
      },
    },
    include: { user: true },
  });

  let userId: string;
  if (existing) {
    userId = existing.userId;
  } else {
    // Link by email if the user already has a password account; else create
    const byEmail = await db.user.findUnique({ where: { email } });
    const user =
      byEmail ??
      (await db.user.create({
        data: {
          email,
          displayName: info.name?.trim() || email.split("@")[0],
          imageUrl: info.picture ?? null,
          emailVerifiedAt: info.email_verified ? new Date() : null,
        },
      }));
    if (byEmail && !byEmail.emailVerifiedAt && info.email_verified) {
      await db.user.update({
        where: { id: byEmail.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
    await db.oAuthAccount.create({
      data: { provider: "google", providerAccountId: info.sub, userId: user.id },
    });
    userId = user.id;
  }

  const session = await createSession(userId, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!session) return fail("setup-required");
  await setSessionCookie(session.token, session.expiresAt);
  return Response.redirect(`${appUrl}/dashboard`, 302);
}
