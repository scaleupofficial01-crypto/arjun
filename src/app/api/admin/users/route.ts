import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

const roleSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["USER", "ADMIN"]),
});

/** POST — promote/demote a user's role. Admin-only; self-change blocked (anti-lockout). */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  if (auth.user.role !== "ADMIN") return json({ error: "Forbidden" }, { status: 403 });
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const parsed = roleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid payload" }, { status: 400 });
  if (parsed.data.userId === auth.user.id) return json({ error: "Cannot change your own role" }, { status: 400 });

  const target = await db.user.update({
    where: { id: parsed.data.userId },
    data: { role: parsed.data.role },
    select: { id: true, email: true, displayName: true, role: true },
  });
  return json({ ok: true, user: target });
}
