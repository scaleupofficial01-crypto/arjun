import { LoginForm } from "@/components/auth-forms";

export const metadata = { title: "Log in — Empire" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ setup?: string; error?: string; reset?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Log in to Empire</h1>
      {params.error && (
        <p className="text-sm text-[var(--color-loss)]">
          Sign-in error: {params.error}
        </p>
      )}
      {params.reset === "ok" && (
        <p className="text-sm text-[var(--color-profit)]">
          Password reset — log in with your new password.
        </p>
      )}
      <LoginForm setupNotice={params.setup ?? null} />
      <p className="text-sm text-center text-[var(--color-muted)]">
        No account? <a className="text-[var(--color-accent)]" href="/register">Create one</a>
      </p>
    </div>
  );
}
