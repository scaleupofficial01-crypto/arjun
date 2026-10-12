import { env } from "@/lib/env";
import { json } from "@/lib/api";
import { checkAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

/**
 * Cron entry point (Vercel Cron in production, local poller in preview).
 * Protected by CRON_SECRET bearer — same secret pattern as Vercel cron docs.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret();
  if (!secret) {
    return json({ error: "CRON_SECRET not configured", code: "setup-required" }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await checkAlerts();
  return json({ ok: true, ...result, time: new Date().toISOString() });
}
