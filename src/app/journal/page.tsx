import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import JournalApp from "./journal-app";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

export const metadata = { title: "Trading Journal — Empire" };
export const dynamic = "force-dynamic";

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string; g?: string }>;
}) {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");
  const { j, g } = await searchParams;

  const db = getDb();
  if (!db) {
    return (
      <main className="min-h-screen">
        <AppNav active="journal" />
        <div className="max-w-4xl mx-auto p-8">
          <div className="card p-6"><span className="badge badge-setup">Database setup required</span></div>
        </div>
      </main>
    );
  }

  const journals = await db.journal.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      groups: { orderBy: { createdAt: "asc" }, include: { _count: { select: { trades: true } } } },
      _count: { select: { trades: true } },
    },
  });

  const selectedId = j && journals.some((x) => x.id === j) ? j : journals[0]?.id ?? null;
  const trades = selectedId
    ? await db.trade.findMany({
        where: { userId: user.id, journalId: selectedId, ...(g ? { groupId: g } : {}) },
        orderBy: [{ exitAt: "desc" }, { entryAt: "desc" }],
        take: 500,
        include: { attachments: { select: { id: true, fileName: true, mime: true, size: true, path: true } } },
      })
    : [];

  return (
    <main className="min-h-screen">
      <AppNav active="journal" />
      <JournalApp
        journals={journals.map((x) => ({
          id: x.id,
          name: x.name,
          tradeCount: x._count.trades,
          groups: x.groups.map((gr) => ({ id: gr.id, name: gr.name, tradeCount: gr._count.trades })),
        }))}
        selectedJournalId={selectedId}
        selectedGroupId={g ?? null}
        trades={trades.map((t) => ({
          id: t.id,
          journalId: t.journalId,
          groupId: t.groupId,
          symbol: t.symbol,
          side: t.side,
          entryPrice: t.entryPrice.toString(),
          exitPrice: t.exitPrice?.toString() ?? null,
          quantity: t.quantity.toString(),
          risk: t.risk?.toString() ?? null,
          fees: t.fees.toString(),
          pnl: t.pnl?.toString() ?? null,
          status: t.status,
          setupTag: t.setupTag,
          notes: t.notes,
          entryAt: t.entryAt.toISOString(),
          exitAt: t.exitAt?.toISOString() ?? null,
          attachments: t.attachments.map((a) => ({
            id: a.id, fileName: a.fileName, mime: a.mime, size: a.size, path: a.path,
          })),
        }))}
      />
    </main>
  );
}
