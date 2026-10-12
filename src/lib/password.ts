import bcrypt from "bcryptjs";

/** bcrypt per master prompt §3 (Auth). Cost 12 balances security/latency. */
const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Minimum strength: 8+ chars, letter + number. */
export function passwordIssues(plain: string): string[] {
  const issues: string[] = [];
  if (plain.length < 8) issues.push("At least 8 characters");
  if (!/[a-zA-Z]/.test(plain)) issues.push("At least one letter");
  if (!/[0-9]/.test(plain)) issues.push("At least one number");
  return issues;
}
