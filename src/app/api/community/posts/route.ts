import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

const postSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  kind: z.enum(["note", "analysis"]).default("note"),
  visibility: z.enum(["PUBLIC", "FOLLOWERS"]).default("PUBLIC"),
});

/** POST — publish a community post (note or analysis). */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid post" }, { status: 400 });
  const post = await db.post.create({
    data: {
      authorId: auth.user.id,
      text: parsed.data.text,
      kind: parsed.data.kind,
      visibility: parsed.data.visibility,
    },
    select: { id: true, createdAt: true },
  });
  return json({ ok: true, id: post.id }, { status: 201 });
}
