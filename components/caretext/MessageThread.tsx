"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import { MessageBubble } from "@/components/caretext/MessageBubble";
import { CallThreadBar } from "@/components/caretext/CallThreadBar";
import { attachReactionsToMessages, type MessageReaction } from "@/lib/message-reactions";

type Message = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
  authorPhone?: string | null;
  isSystemNote?: boolean;
};

type DisplayMessage = Message & {
  reactions: MessageReaction[];
};

type ThreadParticipant = {
  contact: {
    name: string | null;
    phone: string;
  };
};

// Distinct, readable tints so each group sender's replies are easy to tell apart.
// Full class strings (not interpolated) so Tailwind keeps them at build time.
const GROUP_SENDER_COLORS = [
  { bubble: "bg-amber-50 border border-amber-200 text-amber-950", label: "text-amber-700" },
  { bubble: "bg-emerald-50 border border-emerald-200 text-emerald-950", label: "text-emerald-700" },
  { bubble: "bg-sky-50 border border-sky-200 text-sky-950", label: "text-sky-700" },
  { bubble: "bg-violet-50 border border-violet-200 text-violet-950", label: "text-violet-700" },
  { bubble: "bg-rose-50 border border-rose-200 text-rose-950", label: "text-rose-700" },
  { bubble: "bg-teal-50 border border-teal-200 text-teal-950", label: "text-teal-700" },
  { bubble: "bg-orange-50 border border-orange-200 text-orange-950", label: "text-orange-700" },
  { bubble: "bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-950", label: "text-fuchsia-700" },
] as const;

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

type CallLog = {
  id: string;
  status: string;
  durationSeconds: number | null;
  startedAt: string;
};

type ThreadItem =
  | { kind: "message"; id: string; at: string; message: DisplayMessage }
  | { kind: "call"; id: string; at: string; callLog: CallLog };

export const MessageThread = memo(function MessageThread({
  messages,
  callLogs = [],
  conversationId,
  isGroup = false,
  participants,
}: {
  messages: Message[];
  callLogs?: CallLog[];
  conversationId?: string;
  isGroup?: boolean;
  participants?: ThreadParticipant[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledConversationIdRef = useRef<string | null>(null);

  const displayMessages = useMemo(() => attachReactionsToMessages(messages), [messages]);

  const participantNameByPhone = useMemo(() => {
    const map = new Map<string, string>();
    (participants ?? []).forEach((participant) => {
      if (participant.contact.name) {
        map.set(participant.contact.phone, participant.contact.name);
      }
    });
    return map;
  }, [participants]);

  const resolveAuthorLabel = (authorPhone?: string | null) => {
    if (!authorPhone) {
      return "Participant";
    }
    return participantNameByPhone.get(authorPhone) ?? formatPhoneDisplay(authorPhone);
  };

  const colorIndexByPhone = useMemo(() => {
    const map = new Map<string, number>();
    (participants ?? []).forEach((participant, index) => {
      map.set(participant.contact.phone, index % GROUP_SENDER_COLORS.length);
    });
    return map;
  }, [participants]);

  const resolveSenderColor = (authorPhone?: string | null) => {
    if (authorPhone) {
      const index = colorIndexByPhone.get(authorPhone);
      if (index !== undefined) {
        return GROUP_SENDER_COLORS[index];
      }
      // Stable fallback for an author not in the participant list.
      let hash = 0;
      for (let i = 0; i < authorPhone.length; i += 1) {
        hash = (hash + authorPhone.charCodeAt(i)) % GROUP_SENDER_COLORS.length;
      }
      return GROUP_SENDER_COLORS[hash];
    }
    return GROUP_SENDER_COLORS[0];
  };

  const threadItems = useMemo<ThreadItem[]>(() => {
    const items: ThreadItem[] = [
      ...displayMessages.map((message) => ({
        kind: "message" as const,
        id: message.id,
        at: message.createdAt,
        message,
      })),
      ...callLogs.map((callLog) => ({
        kind: "call" as const,
        id: callLog.id,
        at: callLog.startedAt,
        callLog,
      })),
    ];

    return items.sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());
  }, [callLogs, displayMessages]);

  useEffect(() => {
    if (!conversationId || !threadItems.length) {
      return;
    }

    if (lastAutoScrolledConversationIdRef.current === conversationId) {
      return;
    }

    lastAutoScrolledConversationIdRef.current = conversationId;
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      container.scrollTop = container.scrollHeight;
    });
  }, [conversationId, threadItems.length]);

  if (!threadItems.length) {
    return (
      <div className="h-full w-full rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted">
        No messages yet. Send the first SMS to start this conversation.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-slate-50 p-4"
    >
      {threadItems.map((item) =>
        item.kind === "message" ? (
          item.message.isSystemNote ? (
            <p key={item.id} className="px-4 py-1 text-center text-xs text-muted">
              {item.message.body}
            </p>
          ) : (
            <div
              key={item.id}
              className={item.message.reactions.length > 0 ? "pb-2" : undefined}
            >
              {isGroup && item.message.direction === "inbound" ? (
                <p
                  className={`mb-1 pl-1 text-[11px] font-medium ${resolveSenderColor(item.message.authorPhone).label}`}
                >
                  {resolveAuthorLabel(item.message.authorPhone)}
                </p>
              ) : null}
              <MessageBubble
                body={item.message.body}
                direction={item.message.direction}
                status={item.message.status}
                createdAt={item.message.createdAt}
                reactions={item.message.reactions.map((reaction) => reaction.emoji)}
                inboundClassName={
                  isGroup && item.message.direction === "inbound"
                    ? resolveSenderColor(item.message.authorPhone).bubble
                    : undefined
                }
              />
            </div>
          )
        ) : (
          <CallThreadBar
            key={item.id}
            startedAt={item.callLog.startedAt}
            status={item.callLog.status}
            durationSeconds={item.callLog.durationSeconds}
          />
        ),
      )}
    </div>
  );
});
