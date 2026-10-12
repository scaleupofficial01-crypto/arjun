import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <Link href="/" className="text-2xl font-bold mb-8">
        <span className="text-[var(--color-accent)]">Empire</span>
      </Link>
      <div className="card w-full max-w-md p-8">{children}</div>
    </main>
  );
}
