/**
 * Request security helpers (master prompt §5):
 * - CSRF/origin checks on every mutating route
 * - Fixed-window rate limiting (Redis-backed when available, in-memory
 *   fallback) — used on auth + any route touching user data
 */
import { getRedis } from "./redis";

export function isSameOrigin(req: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  const origin = req.headers.get("origin");
  if (!origin) {
    // Browsers always send Origin on cross-site POST; absence here usually
    // means same-site form/nav or a non-browser client. Rely on Sec-Fetch-Site
    // when present.
    const sfs = req.headers.get("sec-fetch-site");
    return !sfs || sfs === "same-origin" || sfs === "same-site" || sfs === "none";
  }
  try {
    const originHost = new URL(origin).host;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return Boolean(host) && originHost === host;
  } catch {
    return false;
  }
}

export function csrfDenied(req: Request): Response | null {
  if (isSameOrigin(req)) return null;
  return Response.json({ error: "Forbidden" }, { status: 403 });
}

// ---- Rate limiting -------------------------------------------------------

type Bucket = { count: number; resetAt: number };
const memoryBuckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateResult> {
  const redis = getRedis();
  if (redis) {
    try {
      const rKey = `rl:${key}`;
      const count = await redis.incr(rKey);
      if (count === 1) await redis.expire(rKey, windowSeconds);
      const ok = count <= limit;
      return {
        ok,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: ok ? 0 : windowSeconds,
      };
    } catch {
      /* fall through to memory */
    }
  }
  const now = Date.now();
  const b = memoryBuckets.get(key);
  if (!b || b.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  b.count += 1;
  const ok = b.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - b.count),
    retryAfterSeconds: ok ? 0 : Math.ceil((b.resetAt - now) / 1000),
  };
}

export function rateLimited(res: RateResult): Response {
  return Response.json(
    { error: "Too many requests. Try again later." },
    { status: 429, headers: { "Retry-After": String(res.retryAfterSeconds) } },
  );
}

/** Best-effort client IP for audit/session metadata. */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}
