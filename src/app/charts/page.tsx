import AppNav from "@/components/app-nav";
import ChartsApp from "./charts-app";

export const metadata = { title: "Live Charts — Empire" };
export const dynamic = "force-dynamic";

export default async function ChartsPage({
  searchParams,
}: {
  searchParams: Promise<{ s?: string }>;
}) {
  const { s } = await searchParams;
  const symbol = (s ?? "BTCUSD").toUpperCase().trim().slice(0, 20) || "BTCUSD";
  return (
    <main className="min-h-screen">
      <AppNav active="charts" />
      <ChartsApp initialSymbol={symbol} />
    </main>
  );
}
