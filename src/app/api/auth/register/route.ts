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
import { csrfDenied, rateLimit, rateLimited, clientIp } from "@/lib/security";
import { json, badRequest } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(80),
});

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;

  const rl = await rateLimit(`register:${clientIp(req) ?? "anon"}`, 10, 600);
  if (!rl.ok) return rateLimited(rl);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid registration data");
  const { email, password, displayName } = parsed.data;

  const issues = passwordIssues(password);
  if (issues.length) return badRequest(issues.join("; "));

  const db = getDb();
  if (!db) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }

  const normalized = email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email: normalized } });
  if (existing) return badRequest("An account with this email already exists");

  const user = await db.user.create({
    data: {
      email: normalized,
      displayName: displayName.trim(),
      passwordHash: await hashPassword(password),
    },
  });

  // Email verification token (24h). If email provider is unconfigured we
  // surface setup-required honestly rather than faking a send.
  const vToken = generateToken();
  await db.verificationToken.create({
    data: {
      tokenHash: hashToken(vToken),
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const emailResult = await sendEmail(
    normalized,
    "Verify your Empire account",
    verificationEmailHtml(`${appUrl}/verify-email?token=${vToken}`),
  );

  const session = await createSession(user.id, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!session) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }
  await setSessionCookie(session.token, session.expiresAt);

  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: false,
    },
    verificationEmail: emailResult.sent
      ? "sent"
      : `not-sent:${emailResult.reason}`,
  });
}
