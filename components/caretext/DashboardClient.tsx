"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConversationList } from "@/components/caretext/ConversationList";
import { ConversationHeader } from "@/components/caretext/ConversationHeader";
import { MessageThread } from "@/components/caretext/MessageThread";
import { MessageComposer } from "@/components/caretext/MessageComposer";
import { ContactDetailsCard } from "@/components/caretext/ContactDetailsCard";
import { InternalNotesPanel } from "@/components/caretext/InternalNotesPanel";

type Template = {
  id: string;
  title: string;
  body: string;
};

type ConversationListResponse = {
  conversations: Array<{
    id: string;
    status: string;
    lastMessageAt: string;
    contact: {
      id: string;
      name: string | null;
      phone: string;
      facility: string | null;
      address: string | null;
      notes: string | null;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
    };
    assignedTo: { id: string; name: string } | null;
    messages: {
      id: string;
      body: string;
      direction: "inbound" | "outbound";
      createdAt: string;
    }[];
  }>;
};

type ConversationDetail = {
  id: string;
  status: string;
  contact: {
    id: string;
    name: string | null;
    phone: string;
    facility: string | null;
    address: string | null;
    notes: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  };
  messages: Array<{
    id: string;
    body: string;
    direction: "inbound" | "outbound";
    status: string;
    createdAt: string;
  }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: { name: string | null };
  }>;
};

export function DashboardClient({ initialConversationId }: { initialConversationId?: string }) {
  const [search, setSearch] = useState("");
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [conversations, setConversations] = useState<ConversationListResponse["conversations"]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const seenInboundMessageIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedInboundSnapshotRef = useRef(false);

  const loadConversations = useCallback(async () => {
    const response = await fetch(`/api/conversations${search ? `?q=${encodeURIComponent(search)}` : ""}`);
    const data: ConversationListResponse = await response.json();
    setConversations(data.conversations);
  }, [search]);

  const loadTemplates = useCallback(async () => {
    const response = await fetch("/api/templates");
    const data = await response.json();
    setTemplates(data.templates);
  }, []);

  const loadConversationDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${id}`);
    if (!response.ok) {
      return;
    }
    const data = await response.json();
    setActiveConversation(data.conversation);
  }, []);

  useEffect(() => {
    void loadConversations();
    void loadTemplates();
  }, [loadConversations, loadTemplates]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!conversationId) {
      setActiveConversation(null);
      return;
    }
    void loadConversationDetail(conversationId);
  }, [conversationId, loadConversationDetail]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
      if (conversationId) {
        loadConversationDetail(conversationId);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [conversationId, loadConversationDetail, loadConversations]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    if (Notification.permission !== "default") {
      return;
    }

    void Notification.requestPermission();
  }, []);

  useEffect(() => {
    const inboundMessages = conversations.flatMap((conversation) =>
      conversation.messages
        .filter((message) => message.direction === "inbound")
        .map((message) => ({
          ...message,
          contactName: conversation.contact.name,
          phone: conversation.contact.phone,
        })),
    );

    if (!hasInitializedInboundSnapshotRef.current) {
      inboundMessages.forEach((message) => {
        seenInboundMessageIdsRef.current.add(message.id);
      });
      hasInitializedInboundSnapshotRef.current = true;
      return;
    }

    const unseenInboundMessages = inboundMessages.filter(
      (message) => !seenInboundMessageIdsRef.current.has(message.id),
    );

    unseenInboundMessages.forEach((message) => {
      seenInboundMessageIdsRef.current.add(message.id);
    });

    if (
      !unseenInboundMessages.length ||
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) {
      return;
    }

    unseenInboundMessages.forEach((message) => {
      const sender = message.contactName?.trim() || message.phone;
      const notification = new Notification(`New SMS from ${sender}`, {
        body: message.body,
        tag: `inbound-sms-${message.id}`,
      });

      notification.onclick = () => {
        window.focus();
      };
    });
  }, [conversations]);

  const defaultPhone = useMemo(() => activeConversation?.contact.phone ?? "", [activeConversation]);
  const showConversationPane = isNewConversation || Boolean(conversationId);

  return (
    <>
      <div className="flex h-[calc(100dvh-5rem)] flex-col gap-3 lg:hidden">
        {!showConversationPane ? (
          <aside className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm"
              placeholder="Search name, phone, or facility"
            />
            <button
              className="rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white"
              onClick={() => {
                setIsNewConversation(true);
                setConversationId(null);
              }}
            >
              New Conversation
            </button>
            <ConversationList
              conversations={conversations}
              selectedConversationId={conversationId ?? undefined}
              onSelect={(id) => {
                setConversationId(id);
                setIsNewConversation(false);
              }}
            />
          </aside>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <button
              className="w-fit rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
              onClick={() => {
                setConversationId(null);
                setIsNewConversation(false);
              }}
            >
              Back to conversations
            </button>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
              <ConversationHeader
                conversationId={activeConversation?.id}
                contactName={activeConversation?.contact.name}
                phone={isNewConversation ? undefined : activeConversation?.contact.phone}
                facility={activeConversation?.contact.facility}
                status={activeConversation?.status}
                onStatusChange={async (status) => {
                  if (!activeConversation) return;
                  await fetch(`/api/conversations/${activeConversation.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status }),
                  });
                  await loadConversationDetail(activeConversation.id);
                  await loadConversations();
                }}
              />
              <div className="min-h-0 h-[40dvh]">
                <MessageThread
                  messages={activeConversation?.messages ?? []}
                  conversationId={activeConversation?.id}
                />
              </div>
              <MessageComposer
                templates={templates}
                conversationId={isNewConversation ? undefined : activeConversation?.id}
                defaultPhone={defaultPhone}
                onSend={async ({ body, phone, conversationId: targetConversationId }) => {
                  const response = await fetch("/api/messages/send", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      body,
                      phone: targetConversationId ? defaultPhone : phone,
                      conversationId: targetConversationId,
                    }),
                  });

                  if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error ?? "Failed to send message.");
                  }

                  const data = await response.json();
                  setConversationId(data.conversationId);
                  setIsNewConversation(false);
                  await loadConversations();
                  await loadConversationDetail(data.conversationId);
                }}
              />
              <ContactDetailsCard
                contact={activeConversation?.contact}
                onUpdated={async () => {
                  if (!activeConversation) return;
                  await loadConversationDetail(activeConversation.id);
                  await loadConversations();
                }}
              />
              <InternalNotesPanel
                conversationId={activeConversation?.id}
                notes={activeConversation?.notes ?? []}
                onCreated={(newNote) => {
                  if (!activeConversation) return;
                  setActiveConversation({
                    ...activeConversation,
                    notes: [newNote, ...activeConversation.notes],
                  });
                }}
              />
            </div>
          </section>
        )}
      </div>

      <div className="hidden h-[calc(100dvh-5rem)] gap-4 lg:flex">
        <aside className="flex w-[360px] flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            placeholder="Search name, phone, or facility"
          />
          <button
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            onClick={() => {
              setIsNewConversation(true);
              setConversationId(null);
            }}
          >
            New Conversation
          </button>
          <ConversationList
            conversations={conversations}
            selectedConversationId={conversationId ?? undefined}
            onSelect={(id) => {
              setConversationId(id);
              setIsNewConversation(false);
            }}
          />
        </aside>

        <section className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="flex min-h-0 min-w-0 flex-col gap-3">
            <ConversationHeader
              conversationId={activeConversation?.id}
              contactName={activeConversation?.contact.name}
              phone={isNewConversation ? undefined : activeConversation?.contact.phone}
              facility={activeConversation?.contact.facility}
              status={activeConversation?.status}
              onStatusChange={async (status) => {
                if (!activeConversation) return;
                await fetch(`/api/conversations/${activeConversation.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status }),
                });
                await loadConversationDetail(activeConversation.id);
                await loadConversations();
              }}
            />
            <div className="min-h-0 flex-1">
              <MessageThread
                messages={activeConversation?.messages ?? []}
                conversationId={activeConversation?.id}
              />
            </div>
            <MessageComposer
              templates={templates}
              conversationId={isNewConversation ? undefined : activeConversation?.id}
              defaultPhone={defaultPhone}
              onSend={async ({ body, phone, conversationId: targetConversationId }) => {
                const response = await fetch("/api/messages/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    body,
                    phone: targetConversationId ? defaultPhone : phone,
                    conversationId: targetConversationId,
                  }),
                });

                if (!response.ok) {
                  const errorData = await response.json();
                  throw new Error(errorData.error ?? "Failed to send message.");
                }

                const data = await response.json();
                setConversationId(data.conversationId);
                setIsNewConversation(false);
                await loadConversations();
                await loadConversationDetail(data.conversationId);
              }}
            />
          </div>

          <div className="space-y-3">
            <ContactDetailsCard
              contact={activeConversation?.contact}
              onUpdated={async () => {
                if (!activeConversation) return;
                await loadConversationDetail(activeConversation.id);
                await loadConversations();
              }}
            />
            <InternalNotesPanel
              conversationId={activeConversation?.id}
              notes={activeConversation?.notes ?? []}
              onCreated={(newNote) => {
                if (!activeConversation) return;
                setActiveConversation({
                  ...activeConversation,
                  notes: [newNote, ...activeConversation.notes],
                });
              }}
            />
          </div>
        </section>
      </div>
    </>
  );
}
