import type { NextConfig } from "next";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Secrets live ONLY in /credentials/.env (master prompt §1). Next.js natively
 * reads .env* from the project root, so we load credentials/.env into
 * process.env here — the file itself never enters git (see .gitignore) and
 * only NEXT_PUBLIC_* keys can ever reach the browser bundle.
 */
const credentialsEnv = join(process.cwd(), "credentials", ".env");
if (existsSync(credentialsEnv)) {
  const raw = readFileSync(credentialsEnv, "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Keep heavy server-only deps out of bundling issues
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
