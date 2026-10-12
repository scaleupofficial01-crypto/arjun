import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const alerts = await db.priceAlert.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
  });
  return json({
    alerts: alerts.map((a) => ({
      ...a,
      targetPrice: a.targetPrice.toString(),
      triggeredPrice: a.triggeredPrice?.toString() ?? null,
    })),
  });
}

const schema = z.object({
  symbol: z.string().min(1).max(20),
  condition: z.enum(["ABOVE", "BELOW"]),
  targetPrice: z.string().regex(/^\d+(\.\d+)?$/, "must be a positive number"),
  note: z.string().max(200).nullable().optional(),
});

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`alert:${auth.user.id}`, 30, 600);
  if (!rl.ok) return rateLimited(rl);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid alert" }, { status: 400 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const count = await db.priceAlert.count({ where: { userId: auth.user.id, active: true } });
  if (count >= 50) return json({ error: "Too many active alerts (max 50)" }, { status: 400 });
  const alert = await db.priceAlert.create({
    data: {
      userId: auth.user.id,
      symbol: parsed.data.symbol.toUpperCase().trim(),
      condition: parsed.data.condition,
      targetPrice: parsed.data.targetPrice,
      note: parsed.data.note ?? null,
    },
  });
  return json({
    alert: { ...alert, targetPrice: alert.targetPrice.toString(), triggeredPrice: null },
    info: "Alerts fire only from real fetched prices (Coinbase live / ECB daily forex).",
  }, { status: 201 });
}
