import { csrfDenied } from "@/lib/security";
import { json, requestUser } from "@/lib/api";
import { clearSessionCookie, revokeSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;

  const auth = await requestUser(req);
  if (auth) {
    // Bug #5: revocation deletes the Redis cache entry, not just the DB row
    await revokeSession(auth.tokenHash);
  }
  await clearSessionCookie();
  return json({ ok: true });
}
