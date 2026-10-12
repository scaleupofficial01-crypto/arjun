import { json, requestUser } from "@/lib/api";
import { integrationStatus } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = await requestUser(req);
  if (!auth) return json({ user: null }, { status: 401 });
  const { user } = auth;
  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      imageUrl: user.imageUrl,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt,
    },
    integrations: integrationStatus(),
  });
}
