import { z } from "zod";
import { getDb } from "@/lib/db";
import { hashToken } from "@/lib/session";
import { csrfDenied, rateLimit, rateLimited, clientIp } from "@/lib/security";
import { json, badRequest } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({ token: z.string().min(10).max(200) });

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const rl = await rateLimit(`verify:${clientIp(req) ?? "anon"}`, 20, 600);
  if (!rl.ok) return rateLimited(rl);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid token");

  const db = getDb();
  if (!db) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }

  const record = await db.verificationToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return badRequest("This verification link is invalid or has expired");
  }

  await db.$transaction([
    db.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    db.verificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);
  return json({ ok: true });
}
