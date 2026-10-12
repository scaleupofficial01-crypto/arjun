import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getDb } from "@/lib/db";
import { computePnl } from "@/lib/pnl";
import { json, requireUser, notFound, badRequest } from "@/lib/api";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";

export const runtime = "nodejs";

const num = z.string().regex(/^\d+(\.\d+)?$/, "must be a positive number");
const createSchema = z.object({
  journalId: z.string().min(1),
  groupId: z.string().min(1).nullable().optional(),
  symbol: z.string().min(1).max(20),
  side: z.enum(["BUY", "SELL"]),
  entryPrice: num,
  exitPrice: num.nullable().optional(),
  quantity: num,
  risk: num.nullable().optional(),
  fees: num.nullable().optional(),
  entryAt: z.string().datetime({ offset: true }).nullable().optional(),
  exitAt: z.string().datetime({ offset: true }).nullable().optional(),
  setupTag: z.string().max(60).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

function serializeTrade<
  T extends {
    entryPrice: Prisma.Decimal;
    exitPrice: Prisma.Decimal | null;
    quantity: Prisma.Decimal;
    risk: Prisma.Decimal | null;
    fees: Prisma.Decimal;
    pnl: Prisma.Decimal | null;
  },
>(t: T) {
  return {
    ...t,
    entryPrice: t.entryPrice.toString(),
    exitPrice: t.exitPrice?.toString() ?? null,
    quantity: t.quantity.toString(),
    risk: t.risk?.toString() ?? null,
    fees: t.fees.toString(),
    pnl: t.pnl?.toString() ?? null,
  };
}

export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const url = new URL(req.url);
  const journalId = url.searchParams.get("journalId");
  const groupId = url.searchParams.get("groupId");
  const status = url.searchParams.get("status");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  // Ownership: every query is always scoped by userId (§5 ownership checks)
  const trades = await db.trade.findMany({
    where: {
      userId: auth.user.id,
      ...(journalId ? { journalId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(status === "OPEN" || status === "CLOSED" ? { status } : {}),
      ...(from || to
        ? { exitAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
        : {}),
    },
    orderBy: [{ exitAt: "desc" }, { entryAt: "desc" }],
    take: 500,
    include: { attachments: { select: { id: true, fileName: true, mime: true, size: true } } },
  });
  return json({ trades: trades.map(serializeTrade) });
}

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`trade-create:${auth.user.id}`, 60, 600);
  if (!rl.ok) return rateLimited(rl);

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid trade data");
  const d = parsed.data;

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  // Journal + optional group must belong to the caller
  const journal = await db.journal.findFirst({
    where: { id: d.journalId, userId: auth.user.id },
    select: { id: true },
  });
  if (!journal) return notFound();
  if (d.groupId) {
    const group = await db.journalGroup.findFirst({
      where: { id: d.groupId, journalId: d.journalId },
      select: { id: true },
    });
    if (!group) return badRequest("Group does not belong to this journal");
  }

  const hasExit = Boolean(d.exitPrice);
  const pnl = hasExit
    ? computePnl({
        side: d.side,
        entryPrice: d.entryPrice,
        exitPrice: d.exitPrice,
        quantity: d.quantity,
        fees: d.fees,
      })
    : null;

  const trade = await db.trade.create({
    data: {
      userId: auth.user.id,
      journalId: d.journalId,
      groupId: d.groupId ?? null,
      symbol: d.symbol.toUpperCase().trim(),
      side: d.side,
      entryPrice: d.entryPrice,
      exitPrice: d.exitPrice ?? null,
      quantity: d.quantity,
      risk: d.risk ?? null,
      fees: d.fees ?? "0",
      pnl,
      status: hasExit ? "CLOSED" : "OPEN",
      setupTag: d.setupTag ?? null,
      notes: d.notes ?? null,
      entryAt: d.entryAt ? new Date(d.entryAt) : new Date(),
      exitAt: hasExit ? (d.exitAt ? new Date(d.exitAt) : new Date()) : null,
    },
    include: { attachments: true },
  });
  return json({ trade: serializeTrade(trade) }, { status: 201 });
}
