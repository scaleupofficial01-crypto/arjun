import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";
import { newIngestToken } from "@/lib/mt5";

export const runtime = "nodejs";

/** Rotate the ingest token (old one stops working immediately). */
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
  const { raw, hash } = newIngestToken();
  await db.mt5Account.update({ where: { id }, data: { ingestTokenHash: hash } });
  return json({ ok: true, ingestToken: raw, notice: "New token shown once — update it in the EA inputs." });
}
