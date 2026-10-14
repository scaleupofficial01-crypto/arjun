"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Row = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verified: boolean;
  createdAt: string;
  sessions: number;
  trades: number;
};

export default function AdminUsers({ users, me }: { users: Row[]; me: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function setRole(userId: string, role: "USER" | "ADMIN") {
    setBusyId(userId);
    setErr(null);
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) setErr(d.error ?? "Failed");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card p-5">
      <h3 className="font-semibold mb-3 text-sm">Users & roles</h3>
      {err && <p className="text-xs text-[var(--color-loss)] mb-2">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
              <th className="py-2 pr-3 font-medium">User</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 pr-3 font-medium">Verified</th>
              <th className="py-2 pr-3 font-medium">Sessions</th>
              <th className="py-2 pr-3 font-medium">Trades</th>
              <th className="py-2 pr-3 font-medium">Joined</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-[var(--color-border)]/50">
                <td className="py-2 pr-3">
                  <span className="font-medium">{u.displayName}</span>
                  <span className="text-[var(--color-muted)] ml-2">{u.email}</span>
                </td>
                <td className="py-2 pr-3">
                  <span className={`badge ${u.role === "ADMIN" ? "badge-live" : "badge-setup"}`}>{u.role}</span>
                </td>
                <td className="py-2 pr-3">{u.verified ? "✓" : "—"}</td>
                <td className="py-2 pr-3">{u.sessions}</td>
                <td className="py-2 pr-3">{u.trades}</td>
                <td className="py-2 pr-3">{new Date(u.createdAt).toLocaleDateString("en-IN")}</td>
                <td className="py-2">
                  {u.id === me || u.id === "demo-user" ? (
                    <span className="text-[var(--color-muted)] text-[10px]">{u.id === me ? "you" : "—"}</span>
                  ) : u.role === "ADMIN" ? (
                    <button
                      className="px-2 py-1 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)]"
                      disabled={busyId === u.id}
                      onClick={() => void setRole(u.id, "USER")}
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      className="px-2 py-1 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)]"
                      disabled={busyId === u.id}
                      onClick={() => void setRole(u.id, "ADMIN")}
                    >
                      Promote
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
