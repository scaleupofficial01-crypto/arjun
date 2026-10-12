import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  hashToken,
  revokeSession,
  revokeAllSessions,
  clearSessionCookie,
} from "@/lib/session";
import { isSameOrigin } from "@/lib/security";

export const runtime = "nodejs";

function back(req: Request, path: string) {
  return Response.redirect(new URL(path, req.url), 303);
}

/** Native form logout. scope=all revokes every live session (sign out everywhere). */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return back(req, "/login");
  const fd = await req.formData().catch(() => null);
  const scope = fd?.get("scope");

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (scope === "all") {
    if (token) {
      const { getSessionUser } = await import("@/lib/session");
      const auth = await getSessionUser(token);
      if (auth) await revokeAllSessions(auth.user.id);
    }
  } else if (token) {
    await revokeSession(hashToken(token));
  }
  await clearSessionCookie();
  return back(req, "/");
}
