"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "@/components/caretext/MessageBubble";

type Message = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
};

export function MessageThread({
  messages,
  conversationId,
}: {
  messages: Message[];
  conversationId?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastAutoScrolledConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversationId || !messages.length) {
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
  }, [conversationId, messages.length]);

  if (!messages.length) {
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
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          body={message.body}
          direction={message.direction}
          status={message.status}
          createdAt={message.createdAt}
        />
      ))}
    </div>
  );
}
