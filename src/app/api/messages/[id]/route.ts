import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

/** GET — conversation thread (members only). Marks my read waterline. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const { id } = await ctx.params;
  const me = auth.user.id;

  const conv = await db.conversation.findFirst({
    where: { id, members: { some: { userId: me } } },
    include: {
      members: { include: { user: { select: { id: true, displayName: true, imageUrl: true } } } },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 200,
        select: { id: true, text: true, createdAt: true, sender: { select: { id: true, displayName: true } } },
      },
    },
  });
  if (!conv) return json({ error: "Not found" }, { status: 404 });

  await db.conversationMember
    .updateMany({ where: { conversationId: id, userId: me }, data: { lastReadAt: new Date() } })
    .catch(() => {});

  return json({
    conversation: {
      id: conv.id,
      isGroup: conv.isGroup,
      name: conv.name,
      members: conv.members.map((m) => ({ id: m.user.id, name: m.user.displayName, imageUrl: m.user.imageUrl })),
    },
    messages: conv.messages.map((m) => ({
      id: m.id,
      text: m.text,
      at: m.createdAt,
      senderId: m.sender.id,
      senderName: m.sender.displayName,
      mine: m.sender.id === me,
    })),
  });
}

const sendSchema = z.object({ text: z.string().trim().min(1).max(4000) });

/** POST — send a message (members only). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const { id } = await ctx.params;
  const me = auth.user.id;

  const member = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: me } },
  });
  if (!member) return json({ error: "Not found" }, { status: 404 });

  const parsed = sendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Message is empty or too long" }, { status: 400 });

  await db.conversation.update({
    where: { id },
    data: {
      updatedAt: new Date(),
      messages: { create: { senderId: me, text: parsed.data.text } },
    },
  });
  await db.conversationMember
    .updateMany({ where: { conversationId: id, userId: me }, data: { lastReadAt: new Date() } })
    .catch(() => {});
  return json({ ok: true }, { status: 201 });
}
