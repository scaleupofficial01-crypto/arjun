import { redirect } from "next/navigation";
import { ResetPasswordForm } from "@/components/auth-forms";
import { DEMO_MODE } from "@/lib/demo";

export const metadata = { title: "New password — Empire" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // No-auth mode: no password flow exists to display.
  if (DEMO_MODE) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Choose a new password</h1>
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p className="text-sm text-[var(--color-loss)]">
          This reset link is missing its token. Request a new one from the
          forgot-password page.
        </p>
      )}
    </div>
  );
}
