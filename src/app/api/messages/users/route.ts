import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";

export const runtime = "nodejs";

/** GET /api/messages/users?q= — find users to start a chat with (logged-in only). */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const q = new URL(req.url).searchParams.get("q")?.trim().slice(0, 60) ?? "";
  const users = await db.user.findMany({
    where: {
      id: { not: auth.user.id },
      ...(q.length > 0
        ? { OR: [{ displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, displayName: true, email: true, imageUrl: true },
  });
  return json({ users });
}
