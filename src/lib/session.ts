import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { getDb } from "./db";
import { cacheGet, cacheSet, cacheDel } from "./redis";

export const SESSION_COOKIE = "empire_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const CACHE_PREFIX = "sess:";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

interface CachedSession {
  userId: string;
  expiresAt: number;
}

/** Create a session row in Postgres and warm the Redis cache. */
export async function createSession(
  userId: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date } | null> {
  const db = getDb();
  if (!db) return null; // setup-required: no database
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await db.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    },
  });
  const cached: CachedSession = { userId, expiresAt: expiresAt.getTime() };
  await cacheSet(CACHE_PREFIX + tokenHash, cached, SESSION_TTL_SECONDS);
  return { token, expiresAt };
}

/**
 * Resolve a session by bearer token. Redis first, Postgres fallback,
 * cache backfill. Returns null when expired or revoked.
 */
export async function getSessionUser(
  token: string,
): Promise<{ user: User; tokenHash: string } | null> {
  const db = getDb();
  if (!db) return null;
  const tokenHash = hashToken(token);

  const cached = await cacheGet<CachedSession>(CACHE_PREFIX + tokenHash);
  if (cached) {
    if (cached.expiresAt <= Date.now()) {
      await cacheDel(CACHE_PREFIX + tokenHash);
      return null;
    }
    const user = await db.user.findUnique({ where: { id: cached.userId } });
    if (!user) return null;
    return { user, tokenHash };
  }

  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }
  const backfill: CachedSession = {
    userId: session.userId,
    expiresAt: session.expiresAt.getTime(),
  };
  const ttl = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
  if (ttl > 0) await cacheSet(CACHE_PREFIX + tokenHash, backfill, ttl);
  return { user: session.user, tokenHash };
}

/**
 * Revoke one session. Bug #5: the Redis cache entry MUST be deleted
 * whenever a session is revoked — not just the DB row — or a revoked
 * session keeps authenticating until TTL expiry.
 */
export async function revokeSession(tokenHash: string): Promise<void> {
  await cacheDel(CACHE_PREFIX + tokenHash); // cache first: immediate effect
  const db = getDb();
  if (!db) return;
  await db.session.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** "Sign out everywhere": revoke every live session for the user. */
export async function revokeAllSessions(userId: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  const live = await db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { tokenHash: true },
  });
  await cacheDel(...live.map((s) => CACHE_PREFIX + s.tokenHash));
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Current request's user from the session cookie (server components/actions). */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await getSessionUser(token);
  return result?.user ?? null;
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    // Production: SameSite=None+Secure so the session also works when the app
    // is embedded (e.g. cross-site preview iframes). CSRF is still enforced
    // via explicit origin checks on every mutating route (§5).
    sameSite: isProd ? "none" : "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
