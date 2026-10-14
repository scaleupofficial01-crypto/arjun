import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { rateLimit, rateLimited } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Recent trade commands for one of the user's accounts — the UI polls this
 * to show queued → executed #ticket / failed <reason> transitions.
 *
 * GET /api/mt5/commands?account=<id>[&after=<commandId>]
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`mt5cmds:${auth.user.id}`, 120, 60);
  if (!rl.ok) return rateLimited(rl);

  const accountId = (new URL(req.url).searchParams.get("account") ?? "").trim();
  if (!accountId) return json({ error: "account param required" }, { status: 400 });

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const account = await db.mt5Account.findFirst({
    where: { id: accountId, userId: auth.user.id },
    select: { id: true, eaVersion: true, lastSyncAt: true },
  });
  if (!account) return json({ error: "Account not found" }, { status: 404 });

  const rows = await db.mt5Command.findMany({
    where: { accountId: account.id },
    orderBy: { createdAt: "desc" },
    take: 25,
  });
  return json({
    account,
    commands: rows.map((c) => ({
      id: c.id, symbol: c.symbol, side: c.side, volume: c.volume.toString(),
      status: c.status, ticket: c.ticket, error: c.error,
      createdAt: c.createdAt.toISOString(), takenAt: c.takenAt?.toISOString() ?? null,
      doneAt: c.doneAt?.toISOString() ?? null,
    })),
  });
}
