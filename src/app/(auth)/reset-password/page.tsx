import { ResetPasswordForm } from "@/components/auth-forms";

export const metadata = { title: "New password — Empire" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
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
