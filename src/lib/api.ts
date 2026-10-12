import type { User } from "@prisma/client";
import { SESSION_COOKIE, getSessionUser } from "./session";
import { DEMO_MODE, DEMO_USER } from "./demo";
import { getDb } from "./db";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function unauthorized(): Response {
  return json({ error: "Not authenticated" }, { status: 401 });
}

export function forbidden(): Response {
  return json({ error: "Forbidden" }, { status: 403 });
}

export function notFound(): Response {
  return json({ error: "Not found" }, { status: 404 });
}

let demoUserEnsured = false;
/** Demo mode identity needs a real DB row so relations/records work. */
async function ensureDemoUserRow(): Promise<void> {
  if (demoUserEnsured) return;
  const db = getDb();
  if (!db) return;
  try {
    await db.user.upsert({
      where: { id: DEMO_USER.id },
      update: {},
      create: {
        id: DEMO_USER.id,
        email: DEMO_USER.email,
        displayName: DEMO_USER.displayName,
        emailVerifiedAt: new Date(),
      },
    });
  } catch {
    /* another request may have created it */
  }
  demoUserEnsured = true;
}

/**
 * Resolve the calling user from the session cookie. In DEMO_MODE (local
 * preview only) an unauthenticated request maps to the demo identity so the
 * app is fully clickable — production never sets DEMO_MODE.
 */
export async function requestUser(
  req: Request,
): Promise<{ user: User; tokenHash: string } | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const token = match ? decodeURIComponent(match.split("=")[1]) : null;
  if (token) {
    const result = await getSessionUser(token);
    if (result) return result;
  }
  if (DEMO_MODE) {
    await ensureDemoUserRow();
    return { user: DEMO_USER, tokenHash: "demo" };
  }
  return null;
}

export async function requireUser(
  req: Request,
): Promise<{ user: User; tokenHash: string } | Response> {
  const result = await requestUser(req);
  if (!result) return unauthorized();
  return result;
}
