import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

const followSchema = z.object({ userId: z.string().min(1) });

/** POST — follow/unfollow a trader (toggle). */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const parsed = followSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid payload" }, { status: 400 });
  const me = auth.user.id;
  const target = parsed.data.userId;
  if (target === me) return json({ error: "Cannot follow yourself" }, { status: 400 });

  const targetUser = await db.user.findUnique({ where: { id: target }, select: { id: true } });
  if (!targetUser) return json({ error: "Not found" }, { status: 404 });

  const existing = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: me, followingId: target } },
  });
  if (existing) {
    await db.follow.delete({ where: { followerId_followingId: { followerId: me, followingId: target } } });
    return json({ following: false });
  }
  await db.follow.create({ data: { followerId: me, followingId: target } });
  return json({ following: true });
}
