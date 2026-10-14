import { getDb } from "@/lib/db";
import { json } from "@/lib/api";
import { hashIngestToken } from "@/lib/mt5";

export const runtime = "nodejs";

/**
 * EA endpoint — the v2 terminal EA reports the TERMINAL'S OWN VERDICT for a
 * command it claimed: the broker's fill ticket, or the exact retcode/reason
 * it failed. The server records both verbatim — failure reasons are never
 * polished or hidden from the user.
 *
 * POST /api/mt5/commands/report
 *   Authorization: Bearer mt5_<token>
 *   { id, result: "DONE"|"FAILED", ticket?, error? }
 */
export async function POST(req: Request) {
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

  let body: Record<string, unknown>;
  try { body = (await req.json()) as Record<string, unknown>; }
  catch { return json({ error: "JSON body required" }, { status: 400 }); }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  const result = body.result;
  if (!id) return json({ error: "id required" }, { status: 400 });
  if (result !== "DONE" && result !== "FAILED")
    return json({ error: "result must be DONE or FAILED" }, { status: 400 });
  const ticket = typeof body.ticket === "string" ? body.ticket.slice(0, 32) : null;
  const error = typeof body.error === "string" ? body.error.slice(0, 200) : null;
  if (result === "DONE" && !ticket) return json({ error: "DONE requires ticket" }, { status: 400 });
  if (result === "FAILED" && !error) return json({ error: "FAILED requires error" }, { status: 400 });

  // Ownership + state check: this token's account must own the command, and
  // only a TAKEN command can be concluded (blocks replays/double-reports).
  const updated = await db.mt5Command.updateMany({
    where: { id, accountId: account.id, status: "TAKEN" },
    data: {
      status: result,
      ticket: result === "DONE" ? ticket : null,
      error: result === "FAILED" ? error : null,
      doneAt: new Date(),
    },
  });
  if (updated.count === 0)
    return json({ error: "command not found or already concluded" }, { status: 409 });

  return json({ ok: true });
}
