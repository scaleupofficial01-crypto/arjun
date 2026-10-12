import { z } from "zod";
import { getDb } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { createSession, setSessionCookie } from "@/lib/session";
import { csrfDenied, rateLimit, rateLimited, clientIp } from "@/lib/security";
import { json, badRequest } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  const csrf = csrfDenied(req);
  if (csrf) return csrf;

  // Strict limit on login attempts per IP + per email (credential stuffing)
  const ipKey = `login-ip:${clientIp(req) ?? "anon"}`;
  const rlIp = await rateLimit(ipKey, 20, 600);
  if (!rlIp.ok) return rateLimited(rlIp);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return badRequest("Invalid credentials format");
  const { email, password } = parsed.data;

  const rlEmail = await rateLimit(`login:${email.toLowerCase()}`, 10, 600);
  if (!rlEmail.ok) return rateLimited(rlEmail);

  const db = getDb();
  if (!db) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  // Uniform failure message — never reveal which part failed
  if (!user || !user.passwordHash) {
    return json({ error: "Invalid email or password" }, { status: 401 });
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return json({ error: "Invalid email or password" }, { status: 401 });
  }

  const session = await createSession(user.id, {
    ip: clientIp(req),
    userAgent: req.headers.get("user-agent"),
  });
  if (!session) {
    return json(
      { error: "Database not configured", code: "setup-required" },
      { status: 503 },
    );
  }
  await setSessionCookie(session.token, session.expiresAt);

  return json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
  });
}
