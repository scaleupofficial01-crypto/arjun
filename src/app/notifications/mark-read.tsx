"use client";

import { useRouter } from "next/navigation";

export default function MarkRead() {
  const router = useRouter();
  return (
    <button
      className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:border-[var(--color-accent)]"
      onClick={async () => {
        await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        router.refresh();
      }}
    >
      Mark all read
    </button>
  );
}
