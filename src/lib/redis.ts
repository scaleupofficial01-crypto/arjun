import { Redis } from "@upstash/redis";
import { env } from "./env";

/**
 * Optional Redis cache (sessions sit in Postgres with Redis in front).
 * If Redis is missing or down we degrade gracefully to DB-only (§3 Auth).
 * Every cache call site must wrap in try/catch — cache failure is NEVER
 * a request failure.
 */
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  const cfg = env.redis();
  client = cfg ? new Redis({ url: cfg.url, token: cfg.token }) : null;
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const r = getRedis();
  if (!r) return null;
  try {
    return (await r.get<T>(key)) ?? null;
  } catch {
    return null; // degrade gracefully
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try {
    await r.set(key, value, { ex: ttlSeconds });
  } catch {
    /* degrade gracefully */
  }
}

export async function cacheDel(...keys: string[]): Promise<void> {
  const r = getRedis();
  if (!r || keys.length === 0) return;
  try {
    await r.del(...keys);
  } catch {
    /* degrade gracefully */
  }
}
