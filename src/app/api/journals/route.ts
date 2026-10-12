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

  const journals = await db.journal.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { trades: true, groups: true } },
      groups: {
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { trades: true } } },
      },
    },
  });
  return json({ journals });
}

const createSchema = z.object({ name: z.string().min(1).max(80) });

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`journal-create:${auth.user.id}`, 30, 600);
  if (!rl.ok) return rateLimited(rl);

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid journal name" }, { status: 400 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });

  const journal = await db.journal.create({
    data: { userId: auth.user.id, name: parsed.data.name.trim() },
  });
  return json({ journal }, { status: 201 });
}
