import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { requireUser, notFound, json } from "@/lib/api";
import { TRADE_CSV_COLUMNS, tradesToCsv } from "@/lib/trade-io";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Export a journal as CSV or Excel — only the owner's data, real stored pnl. */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const journal = await db.journal.findFirst({
    where: { id, userId: auth.user.id },
    include: { groups: true },
  });
  if (!journal) return notFound();

  const groupName = new Map(journal.groups.map((g) => [g.id, g.name]));
  const trades = await db.trade.findMany({
    where: { journalId: id, userId: auth.user.id },
    orderBy: { entryAt: "asc" },
  });

  const rows = trades.map((t) => ({
    symbol: t.symbol,
    side: t.side,
    entryPrice: t.entryPrice.toString(),
    exitPrice: t.exitPrice?.toString() ?? null,
    quantity: t.quantity.toString(),
    risk: t.risk?.toString() ?? null,
    fees: t.fees.toString(),
    entryAt: t.entryAt,
    exitAt: t.exitAt,
    setupTag: t.setupTag,
    notes: t.notes,
    status: t.status,
    pnl: t.pnl?.toString() ?? null,
    group: t.groupId ? groupName.get(t.groupId) ?? null : null,
  }));

  const safeName = journal.name.replace(/[^a-z0-9-_]+/gi, "_");
  if (format === "csv") {
    return new Response(tradesToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="empire-${safeName}.csv"`,
      },
    });
  }

  const sheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      symbol: r.symbol,
      side: r.side,
      entryPrice: r.entryPrice,
      exitPrice: r.exitPrice ?? "",
      quantity: r.quantity,
      risk: r.risk ?? "",
      fees: r.fees,
      entryAt: r.entryAt.toISOString(),
      exitAt: r.exitAt ? r.exitAt.toISOString() : "",
      setupTag: r.setupTag ?? "",
      notes: r.notes ?? "",
      group: r.group ?? "",
      pnl: r.pnl ?? "",
    })),
    { header: [...TRADE_CSV_COLUMNS, "group", "pnl"] as string[] },
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Trades");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="empire-${safeName}.xlsx"`,
    },
  });
}
