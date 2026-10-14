import Link from "next/link";
import CandleGlobe from "@/components/candle-globe";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      <CandleGlobe className="absolute inset-0 h-full w-full" />
      <Link href="/" className="relative z-10 text-2xl font-bold mb-8">
        <span className="text-[var(--color-accent)]">Empire</span>
      </Link>
      <div className="card relative z-10 w-full max-w-md p-8">{children}</div>
    </main>
  );
}
