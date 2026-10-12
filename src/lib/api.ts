import type { User } from "@prisma/client";
import { SESSION_COOKIE, getSessionUser } from "./session";

export function json(data: unknown, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function unauthorized(): Response {
  return json({ error: "Not authenticated" }, { status: 401 });
}

/** Resolve the calling user from the session cookie, or null. */
export async function requestUser(
  req: Request,
): Promise<{ user: User; tokenHash: string } | null> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(/;\s*/)
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  const token = match ? decodeURIComponent(match.split("=")[1]) : null;
  if (!token) return null;
  return getSessionUser(token);
}

export async function requireUser(
  req: Request,
): Promise<{ user: User; tokenHash: string } | Response> {
  const result = await requestUser(req);
  if (!result) return unauthorized();
  return result;
}
