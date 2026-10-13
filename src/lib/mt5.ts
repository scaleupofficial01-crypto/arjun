import { createHash, randomBytes } from "crypto";
import Decimal from "decimal.js";

/**
 * MT5 read-only bridge — pure helpers (unit-tested, no I/O).
 *
 * Security model (§3 MT5 sync): the server NEVER stores MT5 passwords —
 * not master, not investor. The terminal-side EA holds credentials locally
 * and pushes account snapshots with a per-account Bearer ingest token.
 * We store only the token's sha256; the raw token is shown once at setup.
 */

export function newIngestToken(): { raw: string; hash: string } {
  const raw = `mt5_${randomBytes(24).toString("base64url")}`;
  return { raw, hash: hashIngestToken(raw) };
}

export function hashIngestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IngestAccount {
  login?: string;
  server?: string;
  balance?: number;
  equity?: number;
  currency?: string;
}

export interface IngestPosition {
  ticket: string;
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  openPrice: number;
  openAt: string;
  profit?: number;
}

export interface IngestDeal {
  ticket: string;
  positionId: string;
  symbol: string;
  side: "BUY" | "SELL";
  entry: "IN" | "OUT" | "INOUT";
  volume: number;
  price: number;
  profit: number;
  commission: number;
  swap: number;
  dealtAt: string;
}

export interface IngestPayload {
  account: IngestAccount;
  positions: IngestPosition[];
  deals: IngestDeal[];
}

const MAX_POSITIONS = 500;
const MAX_DEALS = 2000;

function str(v: unknown, max = 64): string | null {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** Accepts ISO strings or unix seconds (EA-friendly). */
export function toIsoDate(v: unknown): string | null {
  const n = num(v);
  if (n !== null && n > 946684800 && n < 4102444800) return new Date(n * 1000).toISOString();
  if (typeof v === "string") {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t).toISOString();
  }
  return null;
}

/** Strict payload validation — any junk row fails the whole batch honestly. */
export function parseIngestPayload(body: unknown): IngestPayload {
  if (!body || typeof body !== "object") throw new Error("JSON object body required");
  const b = body as Record<string, unknown>;

  const accountIn = b.account ?? {};
  if (accountIn !== null && typeof accountIn !== "object") throw new Error("account must be an object");
  const a = accountIn as Record<string, unknown>;
  const account: IngestAccount = {};
  if (a.login !== undefined) account.login = str(a.login, 32) ?? undefined;
  if (a.server !== undefined) account.server = str(a.server, 64) ?? undefined;
  if (a.currency !== undefined) account.currency = str(a.currency, 8) ?? undefined;
  if (a.balance !== undefined) {
    const n = num(a.balance);
    if (n === null) throw new Error("account.balance must be a number");
    account.balance = n;
  }
  if (a.equity !== undefined) {
    const n = num(a.equity);
    if (n === null) throw new Error("account.equity must be a number");
    account.equity = n;
  }

  const posIn = Array.isArray(b.positions) ? b.positions : [];
  const dealIn = Array.isArray(b.deals) ? b.deals : [];
  if (posIn.length > MAX_POSITIONS) throw new Error(`positions capped at ${MAX_POSITIONS}`);
  if (dealIn.length > MAX_DEALS) throw new Error(`deals capped at ${MAX_DEALS}`);

  const positions = posIn.map((p, i): IngestPosition => {
    const o = p as Record<string, unknown>;
    const ticket = str(o.ticket, 32);
    const symbol = str(o.symbol, 20);
    const volume = num(o.volume);
    const openPrice = num(o.openPrice);
    const openAt = toIsoDate(o.openAt);
    if (!ticket || !symbol) throw new Error(`positions[${i}]: ticket and symbol required`);
    if (o.side !== "BUY" && o.side !== "SELL") throw new Error(`positions[${i}]: side must be BUY/SELL`);
    if (volume === null || volume <= 0) throw new Error(`positions[${i}]: volume must be > 0`);
    if (openPrice === null || openPrice <= 0) throw new Error(`positions[${i}]: openPrice must be > 0`);
    if (!openAt) throw new Error(`positions[${i}]: openAt unparseable`);
    const profit = o.profit === undefined ? undefined : num(o.profit);
    if (o.profit !== undefined && profit === null) throw new Error(`positions[${i}]: profit must be a number`);
    return { ticket, symbol, side: o.side, volume, openPrice, openAt, profit: profit ?? undefined };
  });

  const deals = dealIn.map((d, i): IngestDeal => {
    const o = d as Record<string, unknown>;
    const ticket = str(o.ticket, 32);
    const positionId = str(o.positionId, 32);
    const symbol = str(o.symbol, 20);
    const volume = num(o.volume);
    const price = num(o.price);
    const profit = num(o.profit);
    const commission = o.commission === undefined ? 0 : num(o.commission);
    const swap = o.swap === undefined ? 0 : num(o.swap);
    const dealtAt = toIsoDate(o.dealtAt);
    if (!ticket || !positionId || !symbol) throw new Error(`deals[${i}]: ticket, positionId, symbol required`);
    if (o.side !== "BUY" && o.side !== "SELL") throw new Error(`deals[${i}]: side must be BUY/SELL`);
    if (o.entry !== "IN" && o.entry !== "OUT" && o.entry !== "INOUT") throw new Error(`deals[${i}]: entry must be IN/OUT/INOUT`);
    if (volume === null || volume <= 0 || price === null || price <= 0)
      throw new Error(`deals[${i}]: volume and price must be > 0`);
    if (profit === null || commission === null || swap === null)
      throw new Error(`deals[${i}]: profit/commission/swap must be numbers`);
    if (!dealtAt) throw new Error(`deals[${i}]: dealtAt unparseable`);
    return { ticket, positionId, symbol, side: o.side, entry: o.entry, volume, price, profit, commission, swap, dealtAt };
  });

  return { account, positions, deals };
}

export interface JournalTradeDraft {
  symbol: string;
  side: "BUY" | "SELL";
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  fees: string;
  entryAt: string;
  exitAt: string;
  setupTag: string;
  notes: string;
  /** deal tickets consumed by this round-trip (mark them imported) */
  dealTickets: string[];
  positionId: string;
}

interface StoredDealLike {
  ticket: string;
  positionId: string;
  symbol: string;
  side: "BUY" | "SELL";
  entry: string;
  volume: Decimal.Value;
  price: Decimal.Value;
  commission: Decimal.Value;
  swap: Decimal.Value;
  dealtAt: Date;
}

/**
 * Pair each position's IN/OUT deals into one CLOSED journal trade draft.
 * Decimal-safe; P&L itself is recomputed later by computePnl from these
 * prices (§3 — server never trusts terminal-reported profit blindly).
 */
export function pairDealsToTrades(deals: StoredDealLike[]): JournalTradeDraft[] {
  const byPos = new Map<string, StoredDealLike[]>();
  for (const d of deals) {
    const list = byPos.get(d.positionId) ?? [];
    list.push(d);
    byPos.set(d.positionId, list);
  }
  const drafts: JournalTradeDraft[] = [];
  for (const [positionId, list] of byPos) {
    const sorted = [...list].sort((x, y) => x.dealtAt.getTime() - y.dealtAt.getTime());
    const inDeal = sorted.find((d) => d.entry === "IN" || d.entry === "INOUT");
    const outDeal = [...sorted].reverse().find((d) => d.entry === "OUT" || d.entry === "INOUT");
    if (!inDeal || !outDeal || inDeal.ticket === outDeal.ticket) continue;
    const fees = sorted
      .reduce((acc, d) => acc.plus(new Decimal(d.commission.toString()).abs()).plus(new Decimal(d.swap.toString()).abs()), new Decimal(0))
      .toFixed(8);
    const qty = new Decimal(outDeal.volume.toString()).toFixed(8);
    if (new Decimal(qty).lte(0)) continue;
    drafts.push({
      symbol: inDeal.symbol,
      side: inDeal.side,
      entryPrice: new Decimal(inDeal.price.toString()).toFixed(8),
      exitPrice: new Decimal(outDeal.price.toString()).toFixed(8),
      quantity: qty,
      fees,
      entryAt: inDeal.dealtAt.toISOString(),
      exitAt: outDeal.dealtAt.toISOString(),
      setupTag: "MT5 sync",
      notes: `MT5 position #${positionId}`,
      dealTickets: sorted.map((d) => d.ticket),
      positionId,
    });
  }
  return drafts;
}
