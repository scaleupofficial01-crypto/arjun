import { readFile } from "fs/promises";
import { join, normalize } from "path";
import { requireUser, forbidden, notFound } from "@/lib/api";
import { uploadsRoot } from "@/app/api/trades/[id]/attachments/route";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };

const SEGMENT = /^[a-zA-Z0-9._-]+$/;

/**
 * Serve trade screenshots. Ownership: the first path segment is the owner's
 * user id and must match the caller — no guessing other users' files.
 */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { path } = await ctx.params;

  if (path.length !== 3 || !path.every((s) => SEGMENT.test(s))) return notFound();
  const [ownerId, tradeId, fileName] = path;
  if (ownerId !== auth.user.id && auth.user.role !== "ADMIN") return forbidden();

  // Primary source: Postgres (durable across serverless deploys).
  try {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    if (db) {
      const att = await db.attachment.findFirst({
        where: { path: `${ownerId}/${tradeId}/${fileName}` },
        select: { data: true, mime: true },
      });
      if (att?.data && att.data.length > 0) {
        return new Response(new Uint8Array(att.data), {
          headers: { "Content-Type": att.mime, "Cache-Control": "private, max-age=31536000, immutable" },
        });
      }
    }
  } catch {
    /* fall through to legacy disk */
  }

  // Legacy fallback: local-preview era files on disk.
  const abs = normalize(join(uploadsRoot(), ownerId, tradeId, fileName));
  if (!abs.startsWith(normalize(uploadsRoot()))) return notFound(); // path traversal guard
  try {
    const data = await readFile(abs);
    const mime = fileName.endsWith(".png")
      ? "image/png"
      : fileName.endsWith(".jpg")
        ? "image/jpeg"
        : fileName.endsWith(".webp")
          ? "image/webp"
          : "image/gif";
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": mime, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return notFound();
  }
}
