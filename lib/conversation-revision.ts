type ListConversation = {
  id: string;
  lastMessageAt: string;
  status: string;
  messages: { id: string }[];
};

type DetailConversation = {
  id: string;
  status: string;
  messages: { id: string; status: string }[];
  notes: { id: string }[];
  callLogs: { id: string; status: string }[];
  participants?: { status: string; contact: { id: string } }[];
};

export function getConversationsListRevision(conversations: ListConversation[]): string {
  return conversations
    .map((conversation) => {
      const preview = conversation.messages[0];
      return `${conversation.id}:${conversation.lastMessageAt}:${conversation.status}:${preview?.id ?? ""}`;
    })
    .join("|");
}

export function getConversationDetailRevision(conversation: DetailConversation): string {
  const lastMessage = conversation.messages.at(-1);
  const participantKey =
    conversation.participants?.map((p) => `${p.contact.id}:${p.status}`).join(",") ?? "";

  return [
    conversation.id,
    conversation.status,
    conversation.messages.length,
    lastMessage?.id ?? "",
    lastMessage?.status ?? "",
    conversation.notes.length,
    conversation.callLogs.length,
    participantKey,
  ].join("|");
}
