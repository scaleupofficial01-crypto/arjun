import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ name: z.string().min(1).max(60) });

export async function PATCH(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid name" }, { status: 400 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const updated = await db.watchlist.updateMany({
    where: { id, userId: auth.user.id },
    data: { name: parsed.data.name.trim() },
  });
  if (updated.count === 0) return notFound();
  return json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const deleted = await db.watchlist.deleteMany({ where: { id, userId: auth.user.id } });
  if (deleted.count === 0) return notFound();
  return json({ ok: true });
}
