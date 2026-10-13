import { redirect } from "next/navigation";
import { VerifyEmail } from "@/components/auth-forms";
import { DEMO_MODE } from "@/lib/demo";

export const metadata = { title: "Verify email — Empire" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  // No-auth mode: no email verification step exists to display.
  if (DEMO_MODE) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Verify your email</h1>
      <VerifyEmail token={token ?? null} />
    </div>
  );
}
