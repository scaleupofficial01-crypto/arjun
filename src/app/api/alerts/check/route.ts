import { json, requireUser } from "@/lib/api";
import { csrfDenied, rateLimit, rateLimited } from "@/lib/security";
import { checkAlerts } from "@/lib/alerts";

export const runtime = "nodejs";

/** Manual "check now" — runs the real price check for the caller's alerts. */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`alert-check:${auth.user.id}`, 10, 60);
  if (!rl.ok) return rateLimited(rl);
  const result = await checkAlerts(auth.user.id);
  return json({ ok: true, ...result });
}
