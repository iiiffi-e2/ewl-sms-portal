"use client";

import { MessageComposer } from "@/components/caretext/MessageComposer";

type Template = {
  id: string;
  title: string;
  body: string;
};

type Participant = {
  status: string;
  contact: {
    name: string | null;
    phone: string;
  };
};

type GroupComposerAreaProps = {
  conversationId: string;
  twilioConversationSid: string | null;
  participants: Participant[];
  templates: Template[];
  onSend: (body: string) => Promise<void> | void;
  onRefresh?: () => void;
};

export function GroupComposerArea({
  conversationId,
  twilioConversationSid,
  participants,
  templates,
  onSend,
}: GroupComposerAreaProps) {
  if (!twilioConversationSid) {
    const pendingNames = participants
      .filter((participant) => participant.status === "pending_intro")
      .map((participant) => participant.contact.name ?? participant.contact.phone);

    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">This group isn&apos;t active yet.</p>
        <p className="mt-1">
          Messaging unlocks once every participant has opted in.
        </p>
        {pendingNames.length ? (
          <p className="mt-1">Waiting for opt-in: {pendingNames.join(", ")}</p>
        ) : null}
      </div>
    );
  }

  return (
    <MessageComposer
      templates={templates}
      conversationId={conversationId}
      onSend={async ({ body }) => {
        await onSend(body);
      }}
    />
  );
}
