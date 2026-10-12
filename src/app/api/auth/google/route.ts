import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const runtime = "nodejs";

const PKCE_COOKIE = "empire_google_pkce";

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/**
 * Start Google Sign-In (OAuth 2.0 + PKCE, master prompt §3).
 * If not configured, we route to a visible setup-required state instead of
 * pretending to work (§1 rule 7).
 */
export async function GET(req: Request) {
  const cfg = env.googleOAuth();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  if (!cfg) {
    return Response.redirect(`${appUrl}/login?setup=google`, 302);
  }

  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(16));

  const store = await cookies();
  store.set(PKCE_COOKIE, JSON.stringify({ verifier, state }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: `${appUrl}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });
  return Response.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    302,
  );
}
