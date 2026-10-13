import { redirect } from "next/navigation";
import { DEMO_MODE } from "@/lib/demo";

export const metadata = { title: "Log in — Empire" };

const ERROR_TEXT: Record<string, string> = {
  invalid: "Invalid email or password.",
  csrf: "Security check failed. Refresh the page and try again.",
  ratelimit: "Too many attempts. Wait a few minutes and try again.",
  setup: "Server is missing configuration (setup required).",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    setup?: string;
    error?: string;
    reset?: string;
  }>;
}) {
  const params = await searchParams;
  // No-auth mode: never render a login step.
  if (DEMO_MODE) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Log in to Empire</h1>
      {params.error && (
        <p className="text-sm text-[var(--color-loss)]">
          {ERROR_TEXT[params.error] ?? `Sign-in error: ${params.error}`}
        </p>
      )}
      {params.reset === "ok" && (
        <p className="text-sm text-[var(--color-profit)]">
          Password reset — log in with your new password.
        </p>
      )}
      {params.setup === "google" && (
        <div className="badge badge-setup w-full justify-center py-2">
          Google Sign-In is not configured yet — setup required. Use
          email/password meanwhile.
        </div>
      )}
      <form action="/api/auth/login-form" method="POST" className="space-y-4">
        <input
          className="input"
          name="email"
          type="email"
          placeholder="Email"
          required
          autoComplete="email"
        />
        <input
          className="input"
          name="password"
          type="password"
          placeholder="Password"
          required
          autoComplete="current-password"
        />
        <button type="submit" className="btn-primary w-full">
          Log in
        </button>
      </form>
      <a
        href="/api/auth/google"
        className="block text-center text-sm px-4 py-2.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]"
      >
        Continue with Google
      </a>
      <div className="flex justify-between text-sm text-[var(--color-muted)]">
        <a className="hover:text-white" href="/forgot-password">
          Forgot password?
        </a>
        <a className="text-[var(--color-accent)]" href="/register">
          Create account
        </a>
      </div>
    </div>
  );
}
