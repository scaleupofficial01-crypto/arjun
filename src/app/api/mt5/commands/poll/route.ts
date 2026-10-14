import { getDb } from "@/lib/db";
import { json } from "@/lib/api";
import { hashIngestToken } from "@/lib/mt5";

export const runtime = "nodejs";

export const maxDuration = 10;

/**
 * EA endpoint — the v2 terminal EA polls this right after each ingest push
 * with the SAME per-account Bearer token (no session, no CSRF — the token
 * IS the credential, exactly like /api/mt5/ingest).
 *
 * Claims QUEUED commands atomically: a race between two EA instances or a
 * double-poll can never hand the same order out twice (updateMany guards on
 * status = QUEUED, and TAKEN rows are per-account).
 *
 * GET /api/mt5/commands/poll
 *   Authorization: Bearer mt5_<token>
 * -> { commands: [{ id, symbol, side, volume }] }   (already TAKEN server-side)
 */
export async function GET(req: Request) {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith("mt5_")) return json({ error: "Bearer mt5_ token required" }, { status: 401 });

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const account = await db.mt5Account.findUnique({
    where: { ingestTokenHash: hashIngestToken(token) },
    select: { id: true },
  });
  if (!account) return json({ error: "Invalid token" }, { status: 401 });

  const queued = await db.mt5Command.findMany({
    where: { accountId: account.id, status: "QUEUED" },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  if (queued.length === 0) return json({ commands: [] });

  const now = new Date();
  const claimed: typeof queued = [];
  for (const c of queued) {
    const r = await db.mt5Command.updateMany({
      where: { id: c.id, status: "QUEUED" },
      data: { status: "TAKEN", takenAt: now },
    });
    if (r.count === 1) claimed.push(c); // someone else won the race — skip
  }

  return json({
    commands: claimed.map((c) => ({
      id: c.id, symbol: c.symbol, side: c.side, volume: c.volume.toString(),
    })),
  });
}
