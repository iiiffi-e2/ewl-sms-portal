"use client";

import { useState } from "react";
import { ConversationListItem } from "@/components/caretext/ConversationListItem";
import { DeleteConversationModal } from "@/components/caretext/DeleteConversationModal";

type Conversation = {
  id: string;
  type?: "direct" | "group";
  title?: string | null;
  status: string;
  lastMessageAt: string;
  contact: {
    name: string | null;
    phone: string;
    consentStatus?: "none" | "opted_in" | "opted_out";
  } | null;
  participants?: { status: string }[];
  assignedTo: {
    name: string;
  } | null;
  messages: { body: string }[];
};

type ConversationListProps = {
  conversations: Conversation[];
  selectedConversationId?: string;
  isAdmin?: boolean;
  onSelect: (id: string) => void;
  onPrefetch?: (id: string) => void;
  onDelete?: (id: string) => Promise<void>;
};

export function ConversationList({
  conversations,
  selectedConversationId,
  isAdmin,
  onSelect,
  onPrefetch,
  onDelete,
}: ConversationListProps) {
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);

  return (
    <>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {conversations.map((conversation) => (
          <ConversationListItem
            key={conversation.id}
            id={conversation.id}
            name={conversation.contact?.name ?? ""}
            phone={conversation.contact?.phone ?? ""}
            preview={conversation.messages[0]?.body ?? ""}
            status={conversation.status}
            consentStatus={conversation.contact?.consentStatus}
            assignedTo={conversation.assignedTo?.name}
            lastMessageAt={conversation.lastMessageAt}
            selected={selectedConversationId === conversation.id}
            isAdmin={isAdmin}
            isGroup={conversation.type === "group"}
            title={conversation.title}
            participantCount={conversation.participants?.length}
            onClick={() => onSelect(conversation.id)}
            onPrefetch={onPrefetch ? () => onPrefetch(conversation.id) : undefined}
            onDelete={
              isAdmin && onDelete ? () => setPendingDelete(conversation) : undefined
            }
          />
        ))}
        {!conversations.length && (
          <p className="rounded-lg border border-dashed border-border bg-white p-4 text-sm text-muted">
            No conversations match your search.
          </p>
        )}
      </div>
      {pendingDelete ? (
        <DeleteConversationModal
          contactLabel={
            pendingDelete.type === "group"
              ? pendingDelete.title ?? "this group"
              : pendingDelete.contact?.name ?? pendingDelete.contact?.phone ?? "this conversation"
          }
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await onDelete?.(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      ) : null}
    </>
  );
}
