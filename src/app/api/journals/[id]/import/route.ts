import * as XLSX from "xlsx";
import { getDb } from "@/lib/db";
import { requireUser, notFound, json } from "@/lib/api";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";
import { parseCsv, parseTradeRow } from "@/lib/trade-io";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Import trades from CSV or Excel into a new group ("Import <date>").
 * pnl is always recomputed from prices — never trusted from the file.
 */
export async function POST(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`import:${auth.user.id}`, 10, 600);
  if (!rl.ok) return rateLimited(rl);

  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const journal = await db.journal.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true },
  });
  if (!journal) return notFound();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_SIZE) return json({ error: "File too large (max 10MB)" }, { status: 400 });

  const name = file.name.toLowerCase();
  let records: Record<string, unknown>[];
  try {
    if (name.endsWith(".csv") || file.type === "text/csv") {
      records = parseCsv(await file.text());
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } else {
      return json({ error: "Unsupported file type — use .csv or .xlsx" }, { status: 400 });
    }
  } catch {
    return json({ error: "Could not parse file" }, { status: 400 });
  }
  if (records.length === 0) return json({ error: "File has no data rows" }, { status: 400 });
  if (records.length > 5000) return json({ error: "Too many rows (max 5000)" }, { status: 400 });

  const errors: { row: number; error: string }[] = [];
  const valid: import("@/lib/trade-io").TradeRow[] = [];
  records.forEach((rec, i) => {
    const parsed = parseTradeRow(rec);
    if ("error" in parsed) errors.push({ row: i + 2, error: parsed.error });
    else valid.push(parsed);
  });
  if (valid.length === 0) {
    return json({ error: "No valid rows", rowErrors: errors.slice(0, 20) }, { status: 400 });
  }

  const group = await db.journalGroup.create({
    data: { journalId: id, name: `Import ${new Date().toISOString().slice(0, 10)}` },
  });
  await db.trade.createMany({
    data: valid.map((v) => ({
      userId: auth.user.id,
      journalId: id,
      groupId: group.id,
      symbol: v.symbol,
      side: v.side,
      entryPrice: v.entryPrice,
      exitPrice: v.exitPrice,
      quantity: v.quantity,
      risk: v.risk,
      fees: v.fees,
      pnl: v.pnl,
      status: v.status,
      setupTag: v.setupTag,
      notes: v.notes,
      entryAt: v.entryAt,
      exitAt: v.exitAt,
    })),
  });
  return json({
    ok: true,
    imported: valid.length,
    skipped: errors.length,
    group: { id: group.id, name: group.name },
    rowErrors: errors.slice(0, 20),
  });
}
