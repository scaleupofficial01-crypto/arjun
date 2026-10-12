import AppNav from "@/components/app-nav";
import CalendarApp from "./calendar-app";

export const metadata = { title: "Calendar — Empire" };
export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  return (
    <main className="min-h-screen">
      <AppNav active="calendar" />
      <CalendarApp initialMonth={m ?? null} />
    </main>
  );
}
