import { Resend } from "resend";
import { env } from "./env";

export interface EmailResult {
  sent: boolean;
  /** "setup-required" when RESEND_API_KEY is not configured. */
  reason?: string;
}

/**
 * Transactional email. If the provider key is missing we do NOT pretend the
 * email went out — the caller surfaces a setup-required state (§1 rule 7).
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<EmailResult> {
  const cfg = env.resend();
  if (!cfg) {
    console.warn("[email] RESEND_API_KEY not configured — email NOT sent to", to);
    return { sent: false, reason: "setup-required" };
  }
  try {
    const resend = new Resend(cfg.apiKey);
    const { error } = await resend.emails.send({
      from: cfg.from,
      to,
      subject,
      html,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

export function verificationEmailHtml(verifyUrl: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;background:#0a0f1a;color:#e5e7eb;padding:32px">
      <h1 style="color:#f59e0b">Empire — The Real Trader's Hub</h1>
      <p>Confirm your email address to activate your account.</p>
      <p><a href="${verifyUrl}" style="background:#f59e0b;color:#0a0f1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p>
      <p style="color:#9ca3af;font-size:12px">This link expires in 24 hours. If you didn't sign up, ignore this email.</p>
    </div>`;
}

export function passwordResetEmailHtml(resetUrl: string): string {
  return `
    <div style="font-family:system-ui,sans-serif;background:#0a0f1a;color:#e5e7eb;padding:32px">
      <h1 style="color:#f59e0b">Empire — The Real Trader's Hub</h1>
      <p>Reset your password using the link below.</p>
      <p><a href="${resetUrl}" style="background:#f59e0b;color:#0a0f1a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
      <p style="color:#9ca3af;font-size:12px">This link expires in 1 hour. If you didn't request this, ignore this email — your password stays unchanged.</p>
    </div>`;
}
