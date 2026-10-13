import "server-only";
import type { User } from "@prisma/client";

/**
 * NO-AUTH MODE (default). Per the owner's directive, the app does not require
 * or display a login step: every visitor lands directly on the internal app
 * content under a shared demo identity. Auth (sessions, /login, /register)
 * is only enforced when AUTH_REQUIRED=true is explicitly set, or in tests
 * (NODE_ENV=test / vitest) so the real auth code paths stay covered.
 *
 * Consequences to remember before enabling for a real audience:
 *  - everyone with the URL shares ONE workspace ("demo-preview-user")
 *  - ownership checks still apply between real users when auth is on
 */
const AUTH_REQUIRED =
  process.env.AUTH_REQUIRED === "true" ||
  ((process.env.NODE_ENV === "test" || process.env.VITEST === "true") &&
    process.env.DEMO_MODE !== "true");

export const DEMO_MODE = !AUTH_REQUIRED;

export const DEMO_USER: User = {
  id: "demo-preview-user",
  email: "demo@empire.local",
  emailVerifiedAt: null,
  passwordHash: null,
  displayName: "Demo Trader",
  role: "USER",
  imageUrl: null,
  createdAt: new Date("2026-10-13T00:00:00.000Z"),
  updatedAt: new Date("2026-10-13T00:00:00.000Z"),
};
