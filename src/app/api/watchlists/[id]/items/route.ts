import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  symbol: z.string().min(1).max(20),
  note: z.string().max(200).nullable().optional(),
});

export async function POST(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`wlitem:${auth.user.id}`, 60, 600);
  if (!rl.ok) return rateLimited(rl);
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid item" }, { status: 400 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const wl = await db.watchlist.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true },
  });
  if (!wl) return notFound();
  const count = await db.watchlistItem.count({ where: { watchlistId: id } });
  if (count >= 100) return json({ error: "Watchlist full (100 items)" }, { status: 400 });
  const item = await db.watchlistItem.upsert({
    where: {
      watchlistId_symbol: { watchlistId: id, symbol: parsed.data.symbol.toUpperCase().trim() },
    },
    update: { note: parsed.data.note ?? null },
    create: {
      watchlistId: id,
      symbol: parsed.data.symbol.toUpperCase().trim(),
      note: parsed.data.note ?? null,
    },
  });
  return json({ item }, { status: 201 });
}
