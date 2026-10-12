import { RegisterForm } from "@/components/auth-forms";

export const metadata = { title: "Create account — Empire" };

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Create your account</h1>
      <RegisterForm />
      <p className="text-sm text-center text-[var(--color-muted)]">
        Have an account? <a className="text-[var(--color-accent)]" href="/login">Log in</a>
      </p>
    </div>
  );
}
