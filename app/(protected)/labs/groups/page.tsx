import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { DashboardClient } from "@/components/caretext/DashboardClient";

// Hidden dark-launch path for testing group messaging in production before it
// ships in the main UI. Admin-only and unlinked from navigation.
export default async function LabsGroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const { conversationId } = await searchParams;
  return <DashboardClient initialConversationId={conversationId} groupsMode />;
}
