import { redirect } from "next/navigation";
import AppNav from "@/components/app-nav";
import Mt5App from "./mt5-app";
import { getCurrentUser } from "@/lib/session";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import { getDb } from "@/lib/db";

export const metadata = { title: "MT5 Sync — Empire" };
export const dynamic = "force-dynamic";

export default async function Mt5Page() {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");
  const db = getDb();
  if (!db) {
    return (
      <main className="min-h-screen"><AppNav active="mt5" />
        <div className="max-w-4xl mx-auto p-8"><div className="card p-6"><span className="badge badge-setup">Database setup required</span></div></div>
      </main>
    );
  }
  return (
    <main className="min-h-screen">
      <AppNav active="mt5" />
      <Mt5App appUrl={process.env.NEXT_PUBLIC_APP_URL ?? ""} />
    </main>
  );
}
