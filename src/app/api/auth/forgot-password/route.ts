import { z } from "zod";
import { getDb } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/session";
import { sendEmail, passwordResetEmailHtml } from "@/lib/email";
import { csrfDenied, rateLimit, rateLimited, clientIp } from "@/lib/security";
import { json, badRequest } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email().max(254) });

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const rl = await rateLimit(`forgot:${clientIp(req) ?? "anon"}`, 5, 600);
  if (!rl.ok) return rateLimited(rl);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid email");
  const email = parsed.data.email.toLowerCase();

  const db = getDb();
  if (!db) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }

  const user = await db.user.findUnique({ where: { email } });
  // Always return ok — never reveal whether the account exists.
  if (user) {
    const token = generateToken();
    await db.passwordResetToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
    const result = await sendEmail(
      email,
      "Reset your Empire password",
      passwordResetEmailHtml(`${appUrl}/reset-password?token=${token}`),
    );
    if (!result.sent && result.reason === "setup-required") {
      return json({
        ok: false,
        error: "Email provider not configured",
        code: "setup-required",
      });
    }
  }
  return json({ ok: true });
}
