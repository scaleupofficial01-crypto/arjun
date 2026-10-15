import "server-only";
import type { User } from "@prisma/client";

/**
 * NO-AUTH MODE (default). Visitors open the app directly — no login wall,
 * no credentials prompt. Everyone without a session shares a single guest
 * identity ("guest") with full feature access, including /admin.
 * AUTH (sessions, /login, /register) is only enforced when AUTH_REQUIRED=true
 * is explicitly set, or in tests (NODE_ENV=test / vitest) so the real auth
 * code paths stay covered.
 */
const AUTH_REQUIRED =
  process.env.AUTH_REQUIRED === "true" ||
  ((process.env.NODE_ENV === "test" || process.env.VITEST === "true") &&
    process.env.DEMO_MODE !== "true");

export const DEMO_MODE = !AUTH_REQUIRED;

export const DEMO_USER: User = {
  id: "demo-preview-user",
  email: "guest@empire.local",
  emailVerifiedAt: null,
  passwordHash: null,
  displayName: "Guest",
  role: "ADMIN",
  imageUrl: null,
  createdAt: new Date("2026-10-13T00:00:00.000Z"),
  updatedAt: new Date("2026-10-13T00:00:00.000Z"),
};
