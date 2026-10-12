"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function LoginForm({ setupNotice }: { setupNotice?: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const r = await post("/api/auth/login", {
      email: fd.get("email"),
      password: fd.get("password"),
    });
    setBusy(false);
    if (r.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(r.data.error ?? "Login failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {setupNotice === "google" && (
        <div className="badge badge-setup w-full justify-center py-2">
          Google Sign-In is not configured yet — setup required. Use
          email/password or ask the admin to add GOOGLE_CLIENT_ID/SECRET.
        </div>
      )}
      {error && <p className="text-sm text-[var(--color-loss)]">{error}</p>}
      <input className="input" name="email" type="email" placeholder="Email" required autoComplete="email" />
      <input className="input" name="password" type="password" placeholder="Password" required autoComplete="current-password" />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
      <a href="/api/auth/google" className="block text-center text-sm px-4 py-2.5 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]">
        Continue with Google
      </a>
      <a href="/forgot-password" className="block text-center text-sm text-[var(--color-muted)] hover:text-white">
        Forgot password?
      </a>
    </form>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const r = await post("/api/auth/register", {
      email: fd.get("email"),
      password: fd.get("password"),
      displayName: fd.get("displayName"),
    });
    setBusy(false);
    if (r.ok) {
      if (typeof r.data.verificationEmail === "string" && r.data.verificationEmail.startsWith("not-sent")) {
        setNotice("Account created. Verification email not sent — email provider setup required.");
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(r.data.error ?? "Registration failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {notice && <p className="text-sm text-amber-400">{notice}</p>}
      {error && <p className="text-sm text-[var(--color-loss)]">{error}</p>}
      <input className="input" name="displayName" placeholder="Display name" required maxLength={80} />
      <input className="input" name="email" type="email" placeholder="Email" required autoComplete="email" />
      <input className="input" name="password" type="password" placeholder="Password (8+ chars, letter + number)" required minLength={8} autoComplete="new-password" />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const r = await post("/api/auth/forgot-password", { email: fd.get("email") });
    setBusy(false);
    if (r.ok && r.data.ok) setDone(true);
    else setError(r.data.error ?? "Could not send reset email");
  }

  if (done) {
    return (
      <p className="text-sm text-[var(--color-profit)]">
        If that email has an account, a reset link is on its way. It expires in 1 hour.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className="text-sm text-[var(--color-loss)]">{error}</p>}
      <input className="input" name="email" type="email" placeholder="Email" required />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const r = await post("/api/auth/reset-password", {
      token,
      password: fd.get("password"),
    });
    setBusy(false);
    if (r.ok) router.push("/login?reset=ok");
    else setError(r.data.error ?? "Reset failed");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <p className="text-sm text-[var(--color-loss)]">{error}</p>}
      <input className="input" name="password" type="password" placeholder="New password (8+ chars, letter + number)" required minLength={8} autoComplete="new-password" />
      <button className="btn-primary w-full" disabled={busy}>
        {busy ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

export function VerifyEmail({ token }: { token: string | null }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  const [message, setMessage] = useState<string>("");

  async function verify() {
    if (!token) {
      setState("err");
      setMessage("No token in link.");
      return;
    }
    const r = await post("/api/auth/verify-email", { token });
    if (r.ok) {
      setState("ok");
    } else {
      setState("err");
      setMessage(r.data.error ?? "Verification failed");
    }
  }

  return (
    <div className="space-y-4 text-center">
      {state === "idle" && (
        <button onClick={verify} className="btn-primary w-full">
          Verify my email
        </button>
      )}
      {state === "ok" && (
        <p className="text-sm text-[var(--color-profit)]">
          Email verified. <a className="underline" href="/dashboard">Go to dashboard</a>
        </p>
      )}
      {state === "err" && <p className="text-sm text-[var(--color-loss)]">{message}</p>}
    </div>
  );
}
