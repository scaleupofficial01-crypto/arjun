import "server-only";

/**
 * Server-only env access (master prompt §1). All getters are lazy so builds
 * never crash on missing keys — instead a feature reports "setup required"
 * in the UI (master prompt §1 rule 7 and §5).
 *
 * NEVER import this file from client components. Use ./env-config instead.
 */

function opt(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : null;
}

function req(name: string): string {
  const v = opt(name);
  if (!v) throw new Error(`Missing required server env var: ${name}`);
  return v;
}

export const env = {
  authSecret: () => req("AUTH_SECRET"),
  databaseUrl: () => opt("DATABASE_URL"),
  directUrl: () => opt("DIRECT_URL"),

  supabase: () => {
    const url = opt("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = opt("SUPABASE_SERVICE_ROLE_KEY");
    return url && serviceRoleKey ? { url, serviceRoleKey } : null;
  },

  /** Redis cache in front of Postgres sessions; null => degrade gracefully. */
  redis: () => {
    const url = opt("REDIS_URL");
    const token = opt("REDIS_TOKEN");
    return url && token ? { url, token } : null;
  },

  resend: () => {
    const apiKey = opt("RESEND_API_KEY");
    return apiKey
      ? { apiKey, from: opt("EMAIL_FROM") ?? "Empire <onboarding@resend.dev>" }
      : null;
  },

  googleOAuth: () => {
    const clientId = opt("GOOGLE_CLIENT_ID");
    const clientSecret = opt("GOOGLE_CLIENT_SECRET");
    return clientId && clientSecret ? { clientId, clientSecret } : null;
  },

  /**
   * Realtime provider (bug #6): NEXT_PUBLIC_REALTIME_PROVIDER and
   * REALTIME_PROVIDER must be set together. Returns null + flags mismatch.
   */
  realtime: () => {
    const pub = process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? null;
    const priv = opt("REALTIME_PROVIDER");
    if (pub !== priv) return { provider: null as string | null, misconfigured: Boolean(pub || priv) };
    return { provider: priv, misconfigured: false };
  },

  livekit: () => {
    const apiKey = opt("LIVEKIT_API_KEY");
    const apiSecret = opt("LIVEKIT_API_SECRET");
    const url = opt("NEXT_PUBLIC_LIVEKIT_URL");
    return apiKey && apiSecret && url ? { apiKey, apiSecret, url } : null;
  },

  /** MT5 bridge — investor/read-only credentials only, never master password. */
  mt5Bridge: () => {
    const url = opt("MT5_BRIDGE_URL");
    const apiKey = opt("MT5_BRIDGE_API_KEY");
    return url && apiKey ? { url, apiKey } : null;
  },

  cronSecret: () => opt("CRON_SECRET"),
};

/** List of integration states for honest UI badges. */
export function integrationStatus() {
  return {
    database: Boolean(env.databaseUrl()),
    redis: Boolean(env.redis()),
    email: Boolean(env.resend()),
    googleOAuth: Boolean(env.googleOAuth()),
    realtime: env.realtime(),
    livekit: Boolean(env.livekit()),
    mt5: Boolean(env.mt5Bridge()),
  };
}
