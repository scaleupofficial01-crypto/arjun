import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { env } from "@/lib/env";
import MeetClient from "./meet-client";

export const metadata = { title: "Empire Meet — video rooms" };

export default async function MeetPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <MeetClient
      lkConfigured={Boolean(env.livekit())}
      defaultName={user.displayName || user.email.split("@")[0]}
    />
  );
}
