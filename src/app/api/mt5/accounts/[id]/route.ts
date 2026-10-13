import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

/** Account detail: open positions + recent deals (ownership enforced). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const account = await db.mt5Account.findFirst({
    where: { id, userId: auth.user.id },
    select: {
      id: true, label: true, login: true, server: true, currency: true,
      balance: true, equity: true, lastSyncAt: true, createdAt: true,
    },
  });
  if (!account) return notFound();

  const [positions, deals] = await Promise.all([
    db.mt5Position.findMany({ where: { accountId: id }, orderBy: { openAt: "desc" } }),
    db.mt5Deal.findMany({ where: { accountId: id }, orderBy: { dealtAt: "desc" }, take: 50 }),
  ]);

  return json({
    account: { ...account, balance: account.balance?.toString() ?? null, equity: account.equity?.toString() ?? null },
    positions: positions.map((p) => ({
      ticket: p.ticket, symbol: p.symbol, side: p.side, volume: p.volume.toString(),
      openPrice: p.openPrice.toString(), openAt: p.openAt, profit: p.profit?.toString() ?? null,
    })),
    deals: deals.map((d) => ({
      ticket: d.ticket, positionId: d.positionId, symbol: d.symbol, side: d.side, entry: d.entry,
      volume: d.volume.toString(), price: d.price.toString(), profit: d.profit.toString(),
      commission: d.commission.toString(), swap: d.swap.toString(), dealtAt: d.dealtAt,
      imported: d.importedTradeId !== null,
    })),
  });
}

/** Remove the account and everything it synced (cascade). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const deleted = await db.mt5Account.deleteMany({ where: { id, userId: auth.user.id } });
  if (deleted.count === 0) return notFound();
  return json({ ok: true, deleted: id });
}
