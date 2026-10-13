import { redirect } from "next/navigation";
import { DEMO_MODE } from "@/lib/demo";

export const metadata = { title: "Create account — Empire" };

const ERROR_TEXT: Record<string, string> = {
  invalid: "Please check your details and try again.",
  exists: "An account with this email already exists — log in instead.",
  weak: "Password needs 8+ characters with at least one letter and one number.",
  csrf: "Security check failed. Refresh the page and try again.",
  ratelimit: "Too many attempts. Wait a few minutes and try again.",
  setup: "Server is missing configuration (setup required).",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  // No-auth mode: never render a sign-up step.
  if (DEMO_MODE) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Create your account</h1>
      {params.error && (
        <p className="text-sm text-[var(--color-loss)]">
          {ERROR_TEXT[params.error] ?? "Something went wrong. Try again."}
        </p>
      )}
      <form action="/api/auth/register-form" method="POST" className="space-y-4">
        <input
          className="input"
          name="displayName"
          placeholder="Display name"
          required
          maxLength={80}
          autoComplete="name"
        />
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
          placeholder="Password (8+ chars, letter + number)"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <button type="submit" className="btn-primary w-full">
          Create account
        </button>
      </form>
      <p className="text-sm text-center text-[var(--color-muted)]">
        Have an account?{" "}
        <a className="text-[var(--color-accent)]" href="/login">
          Log in
        </a>
      </p>
    </div>
  );
}
