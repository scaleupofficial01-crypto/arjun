import { getDb } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/session";
import { sendEmail, verificationEmailHtml } from "@/lib/email";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";
import { json } from "@/lib/api";
import { requestUser } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;

  const auth = await requestUser(req);
  if (!auth) return json({ error: "Not authenticated" }, { status: 401 });
  if (auth.user.emailVerifiedAt) return json({ ok: true, alreadyVerified: true });

  const rl = await rateLimit(`resend-ver:${auth.user.id}`, 3, 600);
  if (!rl.ok) return rateLimited(rl);

  const db = getDb();
  if (!db) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }

  const token = generateToken();
  await db.verificationToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: auth.user.id,
      expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
    },
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const result = await sendEmail(
    auth.user.email,
    "Verify your Empire account",
    verificationEmailHtml(`${appUrl}/verify-email?token=${token}`),
  );
  return json({
    ok: result.sent,
    ...(result.sent ? {} : { error: "Email not sent", code: result.reason }),
  });
}
