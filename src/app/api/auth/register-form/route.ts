import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword, passwordIssues } from "@/lib/password";
import {
  createSession,
  setSessionCookie,
  generateToken,
  hashToken,
} from "@/lib/session";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { rateLimit, clientIp, isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

function back(req: Request, path: string) {
  return Response.redirect(new URL(path, req.url), 303);
}

/** Native HTML form registration (no client JS needed). */
export async function POST(req: Request) {
  console.log("[auth-form] register attempt");
  if (!isSameOrigin(req)) {
    console.log("[auth-form] register csrf-denied");
    return back(req, "/register?error=csrf");
  }
  const rl = await rateLimit(`registerf:${clientIp(req) ?? "anon"}`, 15, 600);
  if (!rl.ok) return back(req, "/register?error=ratelimit");

  const fd = await req.formData();
  const parsed = z
    .object({
      email: z.string().email().max(254),
      password: z.string().min(8).max(128),
      displayName: z.string().min(1).max(80),
    })
    .safeParse({
      email: fd.get("email"),
      password: fd.get("password"),
      displayName: fd.get("displayName"),
    });
  if (!parsed.success) return back(req, "/register?error=invalid");
  if (passwordIssues(parsed.data.password).length) {
    return back(req, "/register?error=weak");
  }

  const db = getDb();
  if (!db) return back(req, "/register?error=setup");

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return back(req, "/register?error=exists");

  const user = await db.user.create({
    data: {
      email,
      displayName: parsed.data.displayName.trim(),
      passwordHash: await hashPassword(parsed.data.password),
    },
  });

  // Verification email when provider is configured; otherwise the dashboard
  // shows the honest "email not verified" state — nothing faked.
  const vToken = generateToken();
  await db.verificationToken.create({
    data: {
      tokenHash: hashToken(vToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  await sendEmail(
    email,
    "Verify your Empire account",
    verificationEmailHtml(`${appUrl}/verify-email?token=${vToken}`),
  );

  const session = await createSession(user.id, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!session) return back(req, "/register?error=setup");
  await setSessionCookie(session.token, session.expiresAt);
  console.log("[auth-form] register success");
  return back(req, "/dashboard?welcome=1");
}
