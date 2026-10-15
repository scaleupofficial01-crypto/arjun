import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { env } from "@/lib/env";
import { DEMO_MODE, DEMO_USER } from "@/lib/demo";
import MeetClient from "./meet-client";

export const metadata = { title: "Empire Meet — video rooms" };

export default async function MeetPage() {
  const sessionUser = await getCurrentUser();
  const user = sessionUser ?? (DEMO_MODE ? DEMO_USER : null);
  if (!user) redirect("/login");
  return (
    <MeetClient
      lkConfigured={Boolean(env.livekit())}
      defaultName={user.displayName || user.email.split("@")[0]}
    />
  );
}
