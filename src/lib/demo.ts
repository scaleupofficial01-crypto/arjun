import "server-only";
import type { User } from "@prisma/client";

/**
 * DEMO MODE — local preview only. When DEMO_MODE=true, protected pages render
 * with a demo identity instead of redirecting to /login. The UI must label
 * this state (honesty rules) and production must NEVER set DEMO_MODE.
 */
export const DEMO_MODE = process.env.DEMO_MODE === "true";

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
