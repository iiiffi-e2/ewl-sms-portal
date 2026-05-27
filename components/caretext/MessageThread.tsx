"use client";

import { useEffect, useMemo, useRef } from "react";
import { MessageBubble } from "@/components/caretext/MessageBubble";
import { CallThreadBar } from "@/components/caretext/CallThreadBar";

type Message = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
};

type CallLog = {
  id: string;
  status: string;
  durationSeconds: number | null;
  startedAt: string;
};

type ThreadItem =
  | { kind: "message"; id: string; at: string; message: Message }
  | { kind: "call"; id: string; at: string; callLog: CallLog };

export function MessageThread({
  messages,
  callLogs = [],
  conversationId,
}: {
  messages: Message[];
  callLogs?: CallLog[];
  conversationId?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledConversationIdRef = useRef<string | null>(null);

  const threadItems = useMemo<ThreadItem[]>(() => {
    const items: ThreadItem[] = [
      ...messages.map((message) => ({
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
  }, [callLogs, messages]);

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
          <MessageBubble
            key={item.id}
            body={item.message.body}
            direction={item.message.direction}
            status={item.message.status}
            createdAt={item.message.createdAt}
          />
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
}
