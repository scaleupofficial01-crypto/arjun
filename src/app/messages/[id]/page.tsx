import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import ThreadApp from "./thread-app";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

export const metadata = { title: "Conversation — Empire" };
export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");
  const { id } = await params;
  const db = getDb();
  if (!db) redirect("/messages");
  const member = await db.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
  });
  if (!member) redirect("/messages");

  return (
    <main className="min-h-screen">
      <AppNav active="messages" />
      <ThreadApp conversationId={id} />
    </main>
  );
}
