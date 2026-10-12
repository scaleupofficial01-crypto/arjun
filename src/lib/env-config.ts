/**
 * Client-safe env values ONLY (master prompt §1). Anything here is shipped to
 * the browser — never import from env.ts, never add secret values.
 */
export const publicConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
  livekitUrl: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? null,
  /** Bug #6: this must match server-side REALTIME_PROVIDER. */
  realtimeProvider: process.env.NEXT_PUBLIC_REALTIME_PROVIDER ?? null,
} as const;
