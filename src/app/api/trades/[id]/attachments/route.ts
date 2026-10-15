import { randomUUID } from "crypto";
import { getDb } from "@/lib/db";
import { json, requireUser, notFound } from "@/lib/api";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const ALLOWED: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const MAX_SIZE = 5 * 1024 * 1024;

export function uploadsRoot(): string {
  // Legacy disk root kept only for serving pre-DB uploads (new uploads are in Postgres).
  return `${process.cwd()}/uploads`;
}

export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const trade = await db.trade.findFirst({
    where: { id, userId: auth.user.id },
    include: { attachments: true },
  });
  if (!trade) return notFound();
  return json({ attachments: trade.attachments });
}

/** Upload a chart screenshot for a trade. Bytes are stored in Postgres
 *  (Attachment.data) and served via the ownership-checked /api/files route. */
export async function POST(req: Request, ctx: Ctx) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`upload:${auth.user.id}`, 20, 600);
  if (!rl.ok) return rateLimited(rl);

  const { id } = await ctx.params;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const trade = await db.trade.findFirst({
    where: { id, userId: auth.user.id },
    select: { id: true },
  });
  if (!trade) return notFound();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return json({ error: "No file uploaded" }, { status: 400 });
  const ext = ALLOWED[file.type];
  if (!ext) return json({ error: "Only png/jpg/webp/gif images allowed" }, { status: 400 });
  if (file.size > MAX_SIZE) return json({ error: "Image too large (max 5MB)" }, { status: 400 });

  const fileName = `${randomUUID()}.${ext}`;
  const relPath = `${auth.user.id}/${trade.id}/${fileName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  // Durable by design: image bytes go straight into Postgres (Vercel disk is
  // ephemeral), so screenshots persist across deploys and devices forever.
  const attachment = await db.attachment.create({
    data: {
      tradeId: trade.id,
      fileName: file.name || fileName,
      mime: file.type,
      size: file.size,
      path: relPath,
      data: bytes,
    },
  });
  return json({ attachment }, { status: 201 });
}
