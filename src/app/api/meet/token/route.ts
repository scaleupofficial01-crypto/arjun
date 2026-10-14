import { AccessToken } from "livekit-server-sdk";
import { env } from "@/lib/env";
import { json, requestUser } from "@/lib/api";

export const runtime = "nodejs";

/**
 * Empire Meet — access-token issuer.
 *
 * Honesty notes: this only signs a LiveKit access token for the LOGGED-IN
 * user. No fake room lists: any clean room name can be joined; LiveKit
 * Cloud enforces identity + TTL. If LiveKit env is missing the route
 * returns setup-required instead of pretending rooms exist.
 */
export async function GET(req: Request) {
  const lk = env.livekit();
  if (!lk) {
    return json(
      { error: "Empire Meet is not configured yet", code: "setup-required" },
      { status: 503 },
    );
  }

  const auth = await requestUser(req);
  if (!auth) return json({ error: "Sign in required" }, { status: 401 });

  const url = new URL(req.url);
  const room = (url.searchParams.get("room") ?? "").trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(room)) {
    return json(
      { error: "Room name must be 3-64 chars (letters, numbers, - and _)" },
      { status: 400 },
    );
  }

  const user = auth.user;
  const name = user.displayName || user.email.split("@")[0];

  const at = new AccessToken(lk.apiKey, lk.apiSecret, {
    identity: user.id,
    name,
    metadata: JSON.stringify({ app: "empire", userId: user.id }),
  });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
  at.ttl = "2h";

  return json({
    token: await at.toJwt(),
    url: lk.url,
    room,
    identity: user.id,
    name,
  });
}
