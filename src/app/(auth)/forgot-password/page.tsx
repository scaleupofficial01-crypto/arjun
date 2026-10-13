import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { DEMO_MODE } from "@/lib/demo";

export const metadata = { title: "Forgot password — Empire" };

export default function ForgotPasswordPage() {
  // No-auth mode: no password flow exists to display.
  if (DEMO_MODE) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Reset your password</h1>
      <ForgotPasswordForm />
      <p className="text-sm text-center text-[var(--color-muted)]">
        <a className="text-[var(--color-accent)]" href="/login">Back to login</a>
      </p>
    </div>
  );
}
