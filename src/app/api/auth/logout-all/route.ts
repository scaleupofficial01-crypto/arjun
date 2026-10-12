import { csrfDenied } from "@/lib/security";
import { json, requireUser } from "@/lib/api";
import {
  clearSessionCookie,
  revokeAllSessions,
} from "@/lib/session";

export const runtime = "nodejs";

/** "Sign out everywhere": revoke ALL live sessions for this user. */
export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  await revokeAllSessions(auth.user.id);
  await clearSessionCookie();
  return json({ ok: true, message: "Signed out of all devices" });
}
