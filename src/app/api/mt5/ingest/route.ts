import { getDb } from "@/lib/db";
import { json } from "@/lib/api";
import { hashIngestToken, parseIngestPayload } from "@/lib/mt5";

export const runtime = "nodejs";

/**
 * EA ingest endpoint — the terminal-side bridge (empire_bridge.mq5) pushes
 * account snapshots here with `Authorization: Bearer mt5_<token>`.
 * The token IS the credential (per-account, sha256-stored, rotatable);
 * no session or CSRF applies, and no password ever crosses this wire.
 * Positions are authoritative (opened/closed reflected); deals upsert by
 * ticket, so re-sends are safe (idempotent).
 */
export async function POST(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith("mt5_")) return json({ error: "Bearer mt5_ token required" }, { status: 401 });

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const account = await db.mt5Account.findUnique({
    where: { ingestTokenHash: hashIngestToken(token) },
    select: { id: true, login: true },
  });
  if (!account) return json({ error: "Invalid token" }, { status: 401 });

  let payload;
  try {
    payload = parseIngestPayload(await req.json());
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Invalid payload" }, { status: 400 });
  }

  // Terminal identity check: if the EA reports its account login it MUST
  // match the registered one — this is what makes "live terminal connected"
  // provable instead of "someone posted numbers".
  if (payload.account.login && payload.account.login !== account.login) {
    return json(
      { error: "login-mismatch", message: `EA reports login ${payload.account.login} but this token belongs to account ${account.login}` },
      { status: 409 },
    );
  }

  const accountUpdate: Record<string, unknown> = { lastSyncAt: new Date() };
  if (payload.account.balance !== undefined) accountUpdate.balance = payload.account.balance;
  if (payload.account.equity !== undefined) accountUpdate.equity = payload.account.equity;
  if (payload.account.currency) accountUpdate.currency = payload.account.currency;
  if (payload.eaVersion !== undefined) accountUpdate.eaVersion = payload.eaVersion;

  // Array-form transaction: single-connection sequential ops. The interactive
  // ($transaction(async (tx) => ...)) protocol breaks under serverless +
  // PgBouncer (P2028: stale transaction id / maxWait exceeded) — this form is
  // the documented safe pattern there, still atomic, still idempotent.
  const openTickets = payload.positions.map((p) => p.ticket);
  const ops = [
    db.mt5Account.update({ where: { id: account.id }, data: accountUpdate }),
    // Positions: authoritative snapshot — anything no longer reported is closed server-side.
    db.mt5Position.deleteMany({
      where: { accountId: account.id, ticket: { notIn: openTickets } },
    }),
    ...payload.positions.map((ppos) =>
      db.mt5Position.upsert({
        where: { accountId_ticket: { accountId: account.id, ticket: ppos.ticket } },
        update: { volume: ppos.volume, openPrice: ppos.openPrice, openAt: new Date(ppos.openAt), profit: ppos.profit ?? null },
        create: {
          accountId: account.id, ticket: ppos.ticket, symbol: ppos.symbol, side: ppos.side,
          volume: ppos.volume, openPrice: ppos.openPrice, openAt: new Date(ppos.openAt), profit: ppos.profit ?? null,
        },
      }),
    ),
    // Deals: immutable history, upsert by unique ticket per account.
    ...payload.deals.map((d) =>
      db.mt5Deal.upsert({
        where: { accountId_ticket: { accountId: account.id, ticket: d.ticket } },
        update: {
          profit: d.profit, commission: d.commission, swap: d.swap,
          volume: d.volume, price: d.price, dealtAt: new Date(d.dealtAt),
        },
        create: {
          accountId: account.id, ticket: d.ticket, positionId: d.positionId,
          symbol: d.symbol, side: d.side, entry: d.entry, volume: d.volume,
          price: d.price, profit: d.profit, commission: d.commission, swap: d.swap,
          dealtAt: new Date(d.dealtAt),
        },
      }),
    ),
    // v2 EA: latest bid/ask per Market Watch symbol — the terminal's own
    // broker feed, upserted (not history; staleness decided by readers).
    ...payload.quotes.map((q) =>
      db.mt5Quote.upsert({
        where: { accountId_symbol: { accountId: account.id, symbol: q.symbol } },
        update: { bid: q.bid, ask: q.ask, tickAt: q.tickAt ? new Date(q.tickAt) : null },
        create: { accountId: account.id, symbol: q.symbol, bid: q.bid, ask: q.ask, tickAt: q.tickAt ? new Date(q.tickAt) : null },
      }),
    ),
  ];
  await db.$transaction(ops);

  return json({
    ok: true,
    accountId: account.id,
    syncedAt: new Date().toISOString(),
    openPositions: payload.positions.length,
    dealsUpserted: payload.deals.length,
    quotesUpserted: payload.quotes.length,
  });
}
