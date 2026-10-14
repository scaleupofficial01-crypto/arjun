import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Persistent per-user per-symbol chart state: drawing tools (trendlines,
 * horizontal/vertical lines) and interaction state (visible range), saved
 * like TradingView's layouts.
 *
 * `scope` keeps separate behaviors apart (e.g. a scope "mt5:<accountId>"
 * isolates each account's trade-map chart). It survives refresh, re-login,
 * and device switches; only an explicit DELETE removes saved drawings.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase().trim();
  const scope = (url.searchParams.get("scope") ?? "").trim();
  const bad = validate(symbol, scope, true);
  if (bad) return bad;

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const layout = await db.chartLayout.findUnique({
    where: { userId_scope_symbol: { userId: auth.user.id, scope, symbol } },
  });
  return json({ symbol, scope, data: layout?.data ?? null, updatedAt: layout?.updatedAt ?? null });
}

export async function PUT(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase().trim();
  const scope = (url.searchParams.get("scope") ?? "").trim();
  const bad = validate(symbol, scope, true);
  if (bad) return bad;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || !("data" in body)) {
    return json({ error: "data payload required" }, { status: 400 });
  }
  const size = JSON.stringify(body.data).length;
  if (size > 2_000_000) return json({ error: "Layout too large" }, { status: 413 });

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const layout = await db.chartLayout.upsert({
    where: { userId_scope_symbol: { userId: auth.user.id, scope, symbol } },
    update: { data: body.data },
    create: { userId: auth.user.id, scope, symbol, data: body.data },
  });
  return json({ ok: true, symbol, scope, updatedAt: layout.updatedAt });
}

/** Explicit user delete — the only way saved drawings are removed. */
export async function DELETE(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "").toUpperCase().trim();
  const scope = (url.searchParams.get("scope") ?? "").trim();
  const bad = validate(symbol, scope, true);
  if (bad) return bad;

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const deleted = await db.chartLayout.deleteMany({
    where: { userId: auth.user.id, scope, symbol },
  });
  if (deleted.count === 0) return notFound();
  return json({ ok: true, deleted: symbol, scope });
}

function validate(symbol: string, scope: string, requireSymbol: boolean): Response | null {
  if (requireSymbol && (!symbol || symbol.length > 30)) return json({ error: "symbol required" }, { status: 400 });
  if (!requireSymbol && symbol && symbol.length > 30) return json({ error: "symbol too long" }, { status: 400 });
  if (scope.length > 80 || /[/\\]/.test(scope)) return json({ error: "invalid scope" }, { status: 400 });
  return null;
}
