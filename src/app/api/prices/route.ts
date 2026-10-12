import { json, requireUser } from "@/lib/api";
import { getPrices } from "@/lib/prices";
import { rateLimit, rateLimited } from "@/lib/security";

export const runtime = "nodejs";

/** Real prices for watchlists — never synthetic, source always labeled. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const rl = await rateLimit(`prices:${auth.user.id}`, 30, 60);
  if (!rl.ok) return rateLimited(rl);
  const symbols = (new URL(req.url).searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
  if (symbols.length === 0) return json({ prices: {} });
  const prices = await getPrices(symbols);
  return json({ prices, time: new Date().toISOString() });
}
