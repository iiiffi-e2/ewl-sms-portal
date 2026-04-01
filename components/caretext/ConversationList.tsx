import { ConversationListItem } from "@/components/caretext/ConversationListItem";

type Conversation = {
  id: string;
  status: string;
  lastMessageAt: string;
  contact: {
    name: string | null;
    phone: string;
  };
  assignedTo: {
    name: string;
  } | null;
  messages: { body: string }[];
};

type ConversationListProps = {
  conversations: Conversation[];
  selectedConversationId?: string;
  onSelect: (id: string) => void;
};

export function ConversationList({
  conversations,
  selectedConversationId,
  onSelect,
}: ConversationListProps) {
  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
      {conversations.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          id={conversation.id}
          name={conversation.contact.name ?? ""}
          phone={conversation.contact.phone}
          preview={conversation.messages[0]?.body ?? ""}
          status={conversation.status}
          assignedTo={conversation.assignedTo?.name}
          lastMessageAt={conversation.lastMessageAt}
          selected={selectedConversationId === conversation.id}
          onClick={() => onSelect(conversation.id)}
        />
      ))}
      {!conversations.length && (
        <p className="rounded-lg border border-dashed border-border bg-white p-4 text-sm text-muted">
          No conversations match your search.
        </p>
      )}
    </div>
  );
}
