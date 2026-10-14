import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import MessagesApp from "./messages-app";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

export const metadata = { title: "Messenger — Empire" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");

  const db = getDb();
  if (!db) {
    return (
      <main className="min-h-screen">
        <AppNav active="messages" />
        <div className="max-w-4xl mx-auto p-8">
          <div className="card p-6">
            <span className="badge badge-setup">Database setup required</span>
          </div>
        </div>
      </main>
    );
  }

  const convs = await db.conversation.findMany({
    where: { members: { some: { userId: user.id } } },
    orderBy: { updatedAt: "desc" },
    include: {
      members: { include: { user: { select: { id: true, displayName: true, imageUrl: true } } } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true, createdAt: true, sender: { select: { displayName: true } } } },
    },
  });

  const items = convs.map((c) => {
    const myRead = c.members.find((m) => m.userId === user.id)?.lastReadAt ?? new Date(0);
    const peer = c.members.find((m) => m.userId !== user.id);
    return {
      id: c.id,
      title: c.isGroup ? c.name ?? `Group (${c.members.length})` : peer?.user.displayName ?? "Conversation",
      members: c.members.length,
      last: c.messages[0]
        ? `${c.messages[0].sender.displayName}: ${c.messages[0].text.slice(0, 60)}`
        : "No messages yet",
      at: c.messages[0]?.createdAt?.toISOString() ?? null,
      hasUnreadMarker: c.messages[0] ? c.messages[0].createdAt > myRead : false,
    };
  });

  return (
    <main className="min-h-screen">
      <AppNav active="messages" />
      <MessagesApp items={items} />
    </main>
  );
}
