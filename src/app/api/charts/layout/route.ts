import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Persistent per-user per-symbol chart state (drawings/annotations).
 * The client captures TradingView's layout store and saves it here; it is
 * restored before the widget mounts so drawings survive refresh, re-login,
 * and device switches. Only an explicit DELETE removes them (§3 charts).
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "").toUpperCase().trim();
  if (!symbol || symbol.length > 30) return json({ error: "symbol required" }, { status: 400 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const layout = await db.chartLayout.findUnique({
    where: { userId_symbol: { userId: auth.user.id, symbol } },
  });
  return json({ symbol, data: layout?.data ?? null, updatedAt: layout?.updatedAt ?? null });
}

export async function PUT(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase().trim();
  if (!symbol || symbol.length > 30) return json({ error: "symbol required" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("data" in body)) {
    return json({ error: "data payload required" }, { status: 400 });
  }
  const size = JSON.stringify(body.data).length;
  if (size > 2_000_000) return json({ error: "Layout too large" }, { status: 413 });

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const layout = await db.chartLayout.upsert({
    where: { userId_symbol: { userId: auth.user.id, symbol } },
    update: { data: body.data },
    create: { userId: auth.user.id, symbol, data: body.data },
  });
  return json({ ok: true, symbol, updatedAt: layout.updatedAt });
}

/** Explicit user delete — the only way saved drawings are removed. */
export async function DELETE(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const symbol = (new URL(req.url).searchParams.get("symbol") ?? "").toUpperCase().trim();
  if (!symbol) return json({ error: "symbol required" }, { status: 400 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const deleted = await db.chartLayout.deleteMany({
    where: { userId: auth.user.id, symbol },
  });
  if (deleted.count === 0) return notFound();
  return json({ ok: true, deleted: symbol });
}
