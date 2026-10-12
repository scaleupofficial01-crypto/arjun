"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}

export function LogoutEverywhereButton() {
  const router = useRouter();
  return (
    <button
      className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-loss)] text-[var(--color-loss)] hover:bg-[var(--color-loss)] hover:text-white"
      onClick={async () => {
        await fetch("/api/auth/logout-all", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      Sign out everywhere
    </button>
  );
}
