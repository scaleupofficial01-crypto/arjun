import { z } from "zod";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, setSessionCookie } from "@/lib/session";
import { rateLimit, clientIp, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

/** PRG: after a form POST always 303-redirect back to a page. */
function back(req: Request, path: string) {
  return Response.redirect(new URL(path, req.url), 303);
}

/**
 * Native HTML form login (no client JS / fetch needed). More resilient in
 * embedded/preview environments where XHR subrequests can be blocked while
 * top-level form navigations pass.
 */
export async function POST(req: Request) {
  console.log("[auth-form] login attempt");
  if (!isSameOrigin(req)) {
    console.log(
      "[auth-form] login csrf-denied origin=",
      req.headers.get("origin"),
      "host=",
      req.headers.get("x-forwarded-host") ?? req.headers.get("host"),
    );
    return back(req, "/login?error=csrf");
  }
  const rl = await rateLimit(`loginf:${clientIp(req) ?? "anon"}`, 30, 600);
  if (!rl.ok) return back(req, "/login?error=ratelimit");

  const fd = await req.formData();
  const parsed = z
    .object({
      email: z.string().email().max(254),
      password: z.string().min(1).max(128),
    })
    .safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return back(req, "/login?error=invalid");

  const db = getDb();
  if (!db) return back(req, "/login?error=setup");

  const user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  const ok =
    user?.passwordHash &&
    (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!ok) {
    console.log("[auth-form] login invalid-credentials");
    return back(req, "/login?error=invalid");
  }

  const session = await createSession(user.id, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!session) return back(req, "/login?error=setup");
  await setSessionCookie(session.token, session.expiresAt);
  console.log("[auth-form] login success");
  return back(req, "/dashboard");
}
