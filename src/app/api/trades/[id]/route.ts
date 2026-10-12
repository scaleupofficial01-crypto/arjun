import { z } from "zod";
import { getDb } from "@/lib/db";
import { computePnl } from "@/lib/pnl";
import { json, requireUser, notFound, badRequest } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const num = z.string().regex(/^\d+(\.\d+)?$/);
const patchSchema = z.object({
  groupId: z.string().min(1).nullable().optional(),
  symbol: z.string().min(1).max(20).optional(),
  side: z.enum(["BUY", "SELL"]).optional(),
  entryPrice: num.optional(),
  exitPrice: num.nullable().optional(),
  quantity: num.optional(),
  risk: num.nullable().optional(),
  fees: num.nullable().optional(),
  entryAt: z.string().datetime({ offset: true }).nullable().optional(),
  exitAt: z.string().datetime({ offset: true }).nullable().optional(),
  setupTag: z.string().max(60).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid trade data");
  const d = parsed.data;

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const existing = await db.trade.findFirst({
    where: { id, userId: auth.user.id }, // ownership enforced in query
  });
  if (!existing) return notFound();

  if (d.groupId) {
    const group = await db.journalGroup.findFirst({
      where: { id: d.groupId, journalId: existing.journalId },
      select: { id: true },
    });
    if (!group) return badRequest("Group does not belong to this journal");
  }

  const side = d.side ?? existing.side;
  const entryPrice = d.entryPrice ?? existing.entryPrice.toString();
  const exitPrice =
    d.exitPrice === undefined ? existing.exitPrice?.toString() ?? null : d.exitPrice;
  const quantity = d.quantity ?? existing.quantity.toString();
  const fees = d.fees === undefined ? existing.fees.toString() : d.fees ?? "0";

  const hasExit = Boolean(exitPrice);
  const pnl = hasExit ? computePnl({ side, entryPrice, exitPrice, quantity, fees }) : null;

  const updated = await db.trade.update({
    where: { id },
    data: {
      ...(d.groupId !== undefined ? { groupId: d.groupId } : {}),
      ...(d.symbol ? { symbol: d.symbol.toUpperCase().trim() } : {}),
      side,
      entryPrice,
      exitPrice,
      quantity,
      risk: d.risk === undefined ? existing.risk : d.risk,
      fees,
      pnl,
      status: hasExit ? "CLOSED" : "OPEN",
      setupTag: d.setupTag === undefined ? existing.setupTag : d.setupTag,
      notes: d.notes === undefined ? existing.notes : d.notes,
      entryAt: d.entryAt ? new Date(d.entryAt) : existing.entryAt,
      exitAt: hasExit
        ? d.exitAt
          ? new Date(d.exitAt)
          : existing.exitAt ?? new Date()
        : null,
    },
  });
  return json({
    trade: {
      ...updated,
      entryPrice: updated.entryPrice.toString(),
      exitPrice: updated.exitPrice?.toString() ?? null,
      quantity: updated.quantity.toString(),
      risk: updated.risk?.toString() ?? null,
      fees: updated.fees.toString(),
      pnl: updated.pnl?.toString() ?? null,
    },
  });
}

/** Delete an individual entry. */
export async function DELETE(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const deleted = await db.trade.deleteMany({ where: { id, userId: auth.user.id } });
  if (deleted.count === 0) return notFound();
  return json({ ok: true, deletedTrade: id });
}
