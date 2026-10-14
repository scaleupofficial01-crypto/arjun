import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";
import { parseTradeRequest, eaSupportsTrading } from "@/lib/mt5";

export const runtime = "nodejs";

/**
 * Queue a market-position command for the user's OWN MT5 account.
 * The server holds no MT5 credentials — it stores the intent; the v2
 * terminal EA claims it within its poll cycle, executes it live in the
 * user's terminal, and reports the broker's own verdict (success ticket or
 * retcode failure). If the EA is offline the command simply waits QUEUED.
 *
 * POST /api/mt5/trade  { accountId, symbol, side: "BUY"|"SELL", volume }
 */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`mt5trade:${auth.user.id}`, 20, 60);
  if (!rl.ok) return rateLimited(rl);

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "JSON body required" }, { status: 400 }); }
  const accountId = typeof (body as { accountId?: unknown })?.accountId === "string"
    ? ((body as { accountId: string }).accountId).trim() : "";
  if (!accountId) return json({ error: "accountId required" }, { status: 400 });

  let req_;
  try { req_ = parseTradeRequest(body); }
  catch (e) { return json({ error: e instanceof Error ? e.message : "Invalid request" }, { status: 400 }); }

  const account = await db.mt5Account.findFirst({
    where: { id: accountId, userId: auth.user.id },
    select: { id: true, eaVersion: true, lastSyncAt: true },
  });
  if (!account) return json({ error: "Account not found" }, { status: 404 });

  // Honest gating (§5-style): a v1 read-only EA physically cannot execute —
  // say so instead of queuing an order that will silently never fill.
  if (!eaSupportsTrading(account.eaVersion)) {
    return json(
      {
        error: "EA update required",
        code: "ea-v1",
        message: "Yeh account abhi v1 (read-only) bridge se sync ho raha hai. Trading ke liye app se naya empire_bridge.mq5 (v2) download karke terminal me replace karo, phir ek sync ke baad SELL/BUY buttons live ho jayenge.",
      },
      { status: 409 },
    );
  }

  const cmd = await db.mt5Command.create({
    data: { accountId: account.id, userId: auth.user.id, symbol: req_.symbol, side: req_.side, volume: req_.volume },
  });
  const staleMs = account.lastSyncAt ? Date.now() - account.lastSyncAt.getTime() : null;
  return json({
    queued: true,
    command: {
      id: cmd.id, symbol: cmd.symbol, side: cmd.side, volume: cmd.volume.toString(),
      status: cmd.status, createdAt: cmd.createdAt.toISOString(),
    },
    // Truthful hint: the fill can only arrive on the EA's next poll.
    eaHint: staleMs === null
      ? "EA kabhi sync nahi hua — command QUEUED rahegi jab tak EA v2 connect na ho."
      : staleMs > 120_000
        ? `EA ${Math.round(staleMs / 60000)}min pehle last sync — offline lagta hai; wapas aane par command execute hogi.`
        : null,
  }, { status: 201 });
}
