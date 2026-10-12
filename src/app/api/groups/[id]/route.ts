import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { getDb } from "@/lib/db";
import { json, requireUser, notFound, badRequest } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({ name: z.string().min(1).max(80) });

async function ownedGroup(db: PrismaClient, id: string, userId: string) {
  return db.journalGroup.findFirst({
    where: { id, journal: { userId } },
    include: { _count: { select: { trades: true } } },
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid name");
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const group = await ownedGroup(db, id, auth.user.id);
  if (!group) return notFound();
  await db.journalGroup.update({ where: { id }, data: { name: parsed.data.name.trim() } });
  return json({ ok: true });
}

/**
 * Group deletion modes (journal spec):
 *  ?mode=group              → delete group only; trades become ungrouped
 *  ?mode=trades             → delete ALL entries in the group; group stays
 *  ?mode=group-with-trades  → delete the whole group AND its entries
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const mode = new URL(req.url).searchParams.get("mode") ?? "group";
  if (!["group", "trades", "group-with-trades"].includes(mode)) {
    return badRequest("Invalid mode");
  }
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const group = await ownedGroup(db, id, auth.user.id);
  if (!group) return notFound();

  let deletedTrades = 0;
  if (mode === "trades" || mode === "group-with-trades") {
    const res = await db.trade.deleteMany({
      where: { groupId: id, userId: auth.user.id },
    });
    deletedTrades = res.count;
  }
  if (mode === "group" || mode === "group-with-trades") {
    await db.journalGroup.delete({ where: { id } }); // trades SetNull→ungrouped in "group" mode
  }
  return json({ ok: true, mode, deletedTrades });
}
