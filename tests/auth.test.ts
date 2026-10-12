import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "../src/lib/session";
import { hashPassword, verifyPassword, passwordIssues } from "../src/lib/password";

describe("session tokens", () => {
  it("generates unique 256-bit tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url")).toHaveLength(32);
  });
  it("hashes deterministically (sha256) and never equals the raw token", () => {
    const t = generateToken();
    const h = hashToken(t);
    expect(hashToken(t)).toBe(h);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe(t);
  });
});

describe("password hashing (bcrypt)", () => {
  it("round-trips correct passwords and rejects wrong ones", async () => {
    const hash = await hashPassword("Trader123");
    expect(hash.startsWith("$2")).toBe(true); // bcrypt prefix
    expect(await verifyPassword("Trader123", hash)).toBe(true);
    expect(await verifyPassword("WrongPass1", hash)).toBe(false);
  });
});

describe("password strength rules", () => {
  it("flags weak passwords", () => {
    expect(passwordIssues("short1").length).toBeGreaterThan(0);
    expect(passwordIssues("allletters").length).toBeGreaterThan(0);
    expect(passwordIssues("12345678").length).toBeGreaterThan(0);
  });
  it("accepts strong passwords", () => {
    expect(passwordIssues("Trader123")).toHaveLength(0);
  });
});
