import { z } from "zod";
import { getDb } from "@/lib/db";
import { json, requireUser } from "@/lib/api";
import { csrfDenied } from "@/lib/security";

export const runtime = "nodejs";

/** GET — my conversations with members, last message, unread count. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const me = auth.user.id;

  const convs = await db.conversation.findMany({
    where: { members: { some: { userId: me } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: { include: { user: { select: { id: true, displayName: true, imageUrl: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, createdAt: true, sender: { select: { displayName: true } } } },
    },
  });

  const myRead = new Map(convs.flatMap((c) => c.members.filter((m) => m.userId === me).map((m) => [c.id, m.lastReadAt])));

  const items = await Promise.all(
    convs.map(async (c) => {
      const since = myRead.get(c.id) ?? new Date(0);
      const unread = await db.message.count({
        where: { conversationId: c.id, createdAt: { gt: since }, NOT: { senderId: me } },
      });
      return {
        id: c.id,
        isGroup: c.isGroup,
        name: c.name,
        members: c.members.map((m) => ({ id: m.user.id, name: m.user.displayName, imageUrl: m.user.imageUrl })),
        lastMessage: c.messages[0]
          ? { text: c.messages[0].text, at: c.messages[0].createdAt, by: c.messages[0].sender.displayName }
          : null,
        unread,
      };
    }),
  );
  return json({ conversations: items });
}

const startSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(20),
  name: z.string().trim().max(60).optional(),
});

/** POST — start a conversation (1:1 reuses existing DM; >1 users = group). */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = getDb();
  if (!db) return json({ error: "Database not configured", code: "setup-required" }, { status: 503 });
  const parsed = startSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid payload" }, { status: 400 });
  const me = auth.user.id;
  const others = [...new Set(parsed.data.userIds)].filter((id) => id !== me);

  const valid = await db.user.findMany({ where: { id: { in: others } }, select: { id: true } });
  const otherIds = valid.map((u) => u.id);
  if (otherIds.length === 0) return json({ error: "No valid members" }, { status: 400 });

  if (otherIds.length === 1 && !parsed.data.name) {
    const existing = await db.conversation.findFirst({
      where: {
        isGroup: false,
        AND: [{ members: { some: { userId: me } } }, { members: { some: { userId: otherIds[0] } } }],
      },
      select: { id: true },
    });
    if (existing) return json({ conversationId: existing.id });
  }

  const conv = await db.conversation.create({
    data: {
      isGroup: otherIds.length > 1,
      name: parsed.data.name ?? null,
      members: { create: [...otherIds, me].map((userId) => ({ userId })) },
    },
    select: { id: true },
  });
  return json({ conversationId: conv.id }, { status: 201 });
}
