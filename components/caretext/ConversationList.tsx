"use client";

import { useState } from "react";
import { ConversationListItem } from "@/components/caretext/ConversationListItem";
import { DeleteConversationModal } from "@/components/caretext/DeleteConversationModal";

type Conversation = {
  id: string;
  status: string;
  lastMessageAt: string;
  contact: {
    name: string | null;
    phone: string;
    consentStatus?: "none" | "opted_in" | "opted_out";
  };
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
  onDelete?: (id: string) => Promise<void>;
};

export function ConversationList({
  conversations,
  selectedConversationId,
  isAdmin,
  onSelect,
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
            name={conversation.contact.name ?? ""}
            phone={conversation.contact.phone}
            preview={conversation.messages[0]?.body ?? ""}
            status={conversation.status}
            consentStatus={conversation.contact.consentStatus}
            assignedTo={conversation.assignedTo?.name}
            lastMessageAt={conversation.lastMessageAt}
            selected={selectedConversationId === conversation.id}
            isAdmin={isAdmin}
            onClick={() => onSelect(conversation.id)}
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
          contactLabel={pendingDelete.contact.name ?? pendingDelete.contact.phone}
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
