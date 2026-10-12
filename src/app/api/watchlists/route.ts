import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const watchlists = await db.watchlist.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "asc" },
    include: { items: { orderBy: { addedAt: "asc" } } },
  });
  return json({ watchlists });
}

const schema = z.object({ name: z.string().min(1).max(60) });

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid name" }, { status: 400 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const wl = await db.watchlist.create({
    data: { userId: auth.user.id, name: parsed.data.name.trim() },
    include: { items: true },
  });
  return json({ watchlist: wl }, { status: 201 });
}
