"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MessageBubble } from "@/components/caretext/MessageBubble";
import { CallThreadBar } from "@/components/caretext/CallThreadBar";
import { attachReactionsToMessages, type MessageReaction } from "@/lib/message-reactions";
import { formatMessageTime } from "@/lib/format";
import { parseNotifyAlertDisplay } from "@/lib/notify-alert-format";

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
  reactionEmojis: string[];
};

type ThreadParticipant = {
  contact: {
    name: string | null;
    phone: string | null;
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
  hasMoreOlder = false,
  isLoadingOlder = false,
  onLoadEarlier,
}: {
  messages: Message[];
  callLogs?: CallLog[];
  conversationId?: string;
  isGroup?: boolean;
  participants?: ThreadParticipant[];
  hasMoreOlder?: boolean;
  isLoadingOlder?: boolean;
  onLoadEarlier?: () => void | Promise<void>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledConversationIdRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);
  const lastThreadItemIdRef = useRef<string | null>(null);
  // Whether the user was pinned near the bottom just before the latest render,
  // so we only auto-follow inbound messages when they weren't reading history.
  const wasNearBottomRef = useRef(true);

  const displayMessages = useMemo<DisplayMessage[]>(
    () =>
      attachReactionsToMessages(messages).map((message) => ({
        ...message,
        reactionEmojis: message.reactions.map((reaction) => reaction.emoji),
      })),
    [messages],
  );

  const participantNameByPhone = useMemo(() => {
    const map = new Map<string, string>();
    (participants ?? []).forEach((participant) => {
      if (participant.contact.name && participant.contact.phone) {
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
      if (participant.contact.phone) {
        map.set(participant.contact.phone, index % GROUP_SENDER_COLORS.length);
      }
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

  const handleLoadEarlier = () => {
    if (isLoadingOlder || !onLoadEarlier) {
      return;
    }
    const container = containerRef.current;
    pendingScrollRestoreRef.current = container
      ? container.scrollHeight - container.scrollTop
      : null;
    void onLoadEarlier();
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && pendingScrollRestoreRef.current !== null) {
      container.scrollTop = container.scrollHeight - pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
    }
  }, [threadItems]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }
      container.scrollTop = container.scrollHeight;
    });
  };

  useEffect(() => {
    if (!conversationId || !threadItems.length) {
      return;
    }

    if (lastAutoScrolledConversationIdRef.current === conversationId) {
      return;
    }

    lastAutoScrolledConversationIdRef.current = conversationId;
    lastThreadItemIdRef.current = threadItems.at(-1)?.id ?? null;
    wasNearBottomRef.current = true;
    scrollToBottom();
  }, [conversationId, threadItems.length]);

  // Follow the thread when a brand-new message lands at the bottom: always for
  // the user's own outbound sends (incl. the optimistic bubble), and for inbound
  // only when the user was already near the bottom rather than reading history.
  useEffect(() => {
    const lastItem = threadItems.at(-1);
    if (!lastItem) {
      return;
    }

    const previousLastId = lastThreadItemIdRef.current;
    lastThreadItemIdRef.current = lastItem.id;

    if (previousLastId === null || previousLastId === lastItem.id) {
      return;
    }

    const isOwnOutbound = lastItem.kind === "message" && lastItem.message.direction === "outbound";
    if (isOwnOutbound || wasNearBottomRef.current) {
      scrollToBottom();
    }
  }, [threadItems]);

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
      onScroll={(event) => {
        const container = event.currentTarget;
        wasNearBottomRef.current =
          container.scrollHeight - container.scrollTop - container.clientHeight < 120;
      }}
      className="flex h-full flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-slate-50 p-4"
    >
      {hasMoreOlder ? (
        <button
          type="button"
          onClick={handleLoadEarlier}
          disabled={isLoadingOlder}
          className="mx-auto shrink-0 rounded-full border border-border bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {isLoadingOlder ? "Loading..." : "Load earlier messages"}
        </button>
      ) : null}
      {threadItems.map((item) =>
        item.kind === "message" ? (
          item.message.isSystemNote ? (
            (() => {
              const alertDisplay = parseNotifyAlertDisplay(item.message.body);
              if (!alertDisplay) {
                return (
                  <p key={item.id} className="px-4 py-1 text-center text-xs text-muted">
                    {item.message.body}
                  </p>
                );
              }

              return (
                <div key={item.id} className="flex justify-start">
                  <div className="max-w-[85%] pl-1 sm:max-w-[70%]">
                    <p className="mb-1 pl-1 text-[11px] font-semibold text-slate-600">
                      {alertDisplay.title}
                    </p>
                    <div
                      className={
                        alertDisplay.cleared
                          ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-emerald-950 shadow-sm"
                          : "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-950 shadow-sm"
                      }
                    >
                      {alertDisplay.lines.length ? (
                        <div className="space-y-1 text-sm leading-relaxed">
                          {alertDisplay.lines.map((line) => (
                            <p key={line}>{line}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed text-slate-600">No details provided.</p>
                      )}
                      <div className="mt-2 text-[11px] text-slate-500">
                        {formatMessageTime(item.message.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
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
                reactions={item.message.reactionEmojis}
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
