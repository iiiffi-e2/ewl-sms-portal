import { DashboardClient } from "@/components/caretext/DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const { conversationId } = await searchParams;
  return <DashboardClient initialConversationId={conversationId} />;
}
