import { VerifyEmail } from "@/components/auth-forms";

export const metadata = { title: "Verify email — Empire" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-center">Verify your email</h1>
      <VerifyEmail token={token ?? null} />
    </div>
  );
}
