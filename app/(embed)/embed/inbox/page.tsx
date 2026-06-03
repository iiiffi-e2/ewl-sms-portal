import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { EmbedInboxClient } from "@/components/caretext/EmbedInboxClient";
import { buildEmbedLoginUrl, EMBED_INBOX_PATH } from "@/lib/embed";

export default async function EmbedInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect(buildEmbedLoginUrl(EMBED_INBOX_PATH));
  }

  const { conversationId } = await searchParams;
  return <EmbedInboxClient initialConversationId={conversationId} />;
}
