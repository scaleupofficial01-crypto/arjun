import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashPassword, passwordIssues } from "@/lib/password";
import { hashToken, revokeAllSessions } from "@/lib/session";
import { csrfDenied, rateLimit, rateLimited, clientIp } from "@/lib/security";
import { json, badRequest } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().min(8).max(128),
});

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const rl = await rateLimit(`reset:${clientIp(req) ?? "anon"}`, 10, 600);
  if (!rl.ok) return rateLimited(rl);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid request");

  const issues = passwordIssues(parsed.data.password);
  if (issues.length) return badRequest(issues.join("; "));

  const db = getDb();
  if (!db) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return badRequest("This reset link is invalid or has expired");
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(parsed.data.password) },
    }),
    db.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
  // Password change revokes every existing session (sign out everywhere)
  await revokeAllSessions(record.userId);
  return json({ ok: true });
}
