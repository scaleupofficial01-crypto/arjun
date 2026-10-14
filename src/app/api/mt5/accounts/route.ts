import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied } from "@/lib/security";
import { newIngestToken } from "@/lib/mt5";

export const runtime = "nodejs";

/** List the user's MT5 accounts (token hashes are never returned). */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const accounts = await db.mt5Account.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, label: true, login: true, server: true, currency: true,
      balance: true, equity: true, lastSyncAt: true, eaVersion: true, createdAt: true,
      _count: { select: { positions: true, deals: true } },
    },
  });
  return json({
    accounts: accounts.map((a) => ({
      ...a,
      balance: a.balance?.toString() ?? null,
      equity: a.equity?.toString() ?? null,
      positions: a._count.positions,
      deals: a._count.deals,
      _count: undefined,
    })),
  });
}

/**
 * Register an MT5 account. We store ONLY public metadata (login number,
 * server, label) — never any password. Response includes the raw ingest
 * token exactly once; it is not retrievable later (rotate instead).
 */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    label?: unknown; login?: unknown; server?: unknown; currency?: unknown;
  } | null;
  const label = typeof body?.label === "string" ? body.label.trim().slice(0, 60) : "";
  const login = typeof body?.login === "string" ? body.login.trim().slice(0, 32) : "";
  const server = typeof body?.server === "string" ? body.server.trim().slice(0, 64) : "";
  const currency =
    typeof body?.currency === "string" && /^[A-Z]{3}$/i.test(body.currency.trim())
      ? body.currency.trim().toUpperCase()
      : "USD";
  if (!label) return json({ error: "label required" }, { status: 400 });
  if (!/^\d{4,16}$/.test(login)) return json({ error: "login must be the MT5 account number (4–16 digits)" }, { status: 400 });
  if (!server) return json({ error: "server required (e.g. ICMarkets-Demo)" }, { status: 400 });

  const dupe = await db.mt5Account.findFirst({ where: { userId: auth.user.id, login, server } });
  if (dupe) return json({ error: "This account (login + server) is already registered" }, { status: 409 });

  const { raw, hash } = newIngestToken();
  const account = await db.mt5Account.create({
    data: { userId: auth.user.id, label, login, server, currency, ingestTokenHash: hash },
    select: {
      id: true, label: true, login: true, server: true, currency: true,
      balance: true, equity: true, lastSyncAt: true, eaVersion: true, createdAt: true,
    },
  });
  return json(
    {
      account,
      ingestToken: raw,
      notice: "Save this token now — it is shown only once. No password was taken or stored.",
    },
    { status: 201 },
  );
}
