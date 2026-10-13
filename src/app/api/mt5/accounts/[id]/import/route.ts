import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";
import { pairDealsToTrades } from "@/lib/mt5";
import { computePnl } from "@/lib/pnl";

export const runtime = "nodejs";

/**
 * Import closed MT5 round-trips into a journal as real Trade rows.
 * Idempotent: positions whose deals are already imported are skipped;
 * pnl is recomputed server-side from entry/exit/qty/fees (never trusted
 * from the terminal per §3).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const account = await db.mt5Account.findFirst({ where: { id, userId: auth.user.id } });
  if (!account) return notFound();

  const body = (await req.json().catch(() => null)) as { journalId?: unknown } | null;
  const journalId = typeof body?.journalId === "string" ? body.journalId : "";
  const journal = await db.journal.findFirst({ where: { id: journalId, userId: auth.user.id } });
  if (!journal) return json({ error: "journalId invalid" }, { status: 400 });

  const deals = await db.mt5Deal.findMany({
    where: { accountId: id },
    orderBy: { dealtAt: "asc" },
  });
  const drafts = pairDealsToTrades(deals);

  let imported = 0;
  let skipped = 0;
  const journalGroup = await db.journalGroup.findFirst({
    where: { journalId, name: "MT5 sync" },
    select: { id: true },
  });
  const groupId =
    journalGroup?.id ??
    (
      await db.journalGroup.create({
        data: { journalId, name: "MT5 sync" },
        select: { id: true },
      })
    ).id;

  for (const draft of drafts) {
    const tickets = draft.dealTickets;
    const already = deals.filter((d) => tickets.includes(d.ticket) && d.importedTradeId !== null);
    if (already.length > 0) {
      skipped++;
      continue;
    }
    const pnl = computePnl({
      side: draft.side,
      entryPrice: draft.entryPrice,
      exitPrice: draft.exitPrice,
      quantity: draft.quantity,
      fees: draft.fees,
    });
    const trade = await db.trade.create({
      data: {
        userId: auth.user.id,
        journalId,
        groupId,
        symbol: draft.symbol,
        side: draft.side,
        entryPrice: draft.entryPrice,
        exitPrice: draft.exitPrice,
        quantity: draft.quantity,
        fees: draft.fees,
        pnl,
        status: "CLOSED",
        setupTag: draft.setupTag,
        notes: draft.notes,
        entryAt: new Date(draft.entryAt),
        exitAt: new Date(draft.exitAt),
      },
      select: { id: true },
    });
    await db.mt5Deal.updateMany({
      where: { accountId: id, ticket: { in: tickets } },
      data: { importedTradeId: trade.id },
    });
    imported++;
  }

  return json({ ok: true, imported, skipped, candidates: drafts.length, journalId, groupId });
}
