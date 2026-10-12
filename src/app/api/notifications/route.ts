import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const [notifications, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId: auth.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.notification.count({ where: { userId: auth.user.id, readAt: null } }),
  ]);
  return json({ notifications, unread });
}

const schema = z.object({ id: z.string().optional(), all: z.boolean().optional() });

export async function PATCH(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return notFound();
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  if (parsed.data.all) {
    await db.notification.updateMany({
      where: { userId: auth.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return json({ ok: true });
  }
  if (parsed.data.id) {
    await db.notification.updateMany({
      where: { id: parsed.data.id, userId: auth.user.id },
      data: { readAt: new Date() },
    });
  }
  return json({ ok: true });
}
