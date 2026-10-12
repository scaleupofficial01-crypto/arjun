import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ name: z.string().min(1).max(80) });

export async function POST(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid group name" }, { status: 400 });

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const journal = await db.journal.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true },
  });
  if (!journal) return notFound();
  const group = await db.journalGroup.create({
    data: { journalId: id, name: parsed.data.name.trim() },
  });
  return json({ group }, { status: 201 });
}
