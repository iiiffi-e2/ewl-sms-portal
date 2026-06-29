"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ConversationList } from "@/components/caretext/ConversationList";
import { ConversationHeader } from "@/components/caretext/ConversationHeader";
import { MessageThread } from "@/components/caretext/MessageThread";
import { ConversationComposerArea } from "@/components/caretext/ConversationComposerArea";
import { GroupComposerArea } from "@/components/caretext/GroupComposerArea";
import { NewGroupConversationModal } from "@/components/caretext/NewGroupConversationModal";
import { ContactDetailsCard } from "@/components/caretext/ContactDetailsCard";
import { InternalNotesPanel } from "@/components/caretext/InternalNotesPanel";
import { CallLogsPanel } from "@/components/caretext/CallLogsPanel";
import { VoiceCallProvider } from "@/components/caretext/VoiceCallProvider";
import { CallBar } from "@/components/caretext/CallBar";

type Template = {
  id: string;
  title: string;
  body: string;
};

type ConversationParticipant = {
  status: string;
  contact: {
    id: string;
    name: string | null;
    phone: string;
    consentStatus: string;
  };
};

type ConversationListResponse = {
  conversations: Array<{
    id: string;
    type: "direct" | "group";
    title?: string | null;
    twilioConversationSid?: string | null;
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
      consentStatus: "none" | "opted_in" | "opted_out";
    } | null;
    participants?: ConversationParticipant[];
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
  type: "direct" | "group";
  title?: string | null;
  twilioConversationSid?: string | null;
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
    consentStatus: "none" | "opted_in" | "opted_out";
  } | null;
  participants?: ConversationParticipant[];
  messages: Array<{
    id: string;
    body: string;
    direction: "inbound" | "outbound";
    status: string;
    createdAt: string;
    authorPhone?: string | null;
    isSystemNote?: boolean;
  }>;
  notes: Array<{
    id: string;
    body: string;
    createdAt: string;
    user: { name: string | null };
  }>;
  callLogs: Array<{
    id: string;
    phone: string;
    status: string;
    durationSeconds: number | null;
    startedAt: string;
    endedAt: string | null;
    outcome: string | null;
    initiatedBy: { name: string | null } | null;
  }>;
};

export function DashboardClient({
  initialConversationId,
  groupsMode = false,
}: {
  initialConversationId?: string;
  groupsMode?: boolean;
}) {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [draftPhone, setDraftPhone] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [conversations, setConversations] = useState<ConversationListResponse["conversations"]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const seenInboundMessageIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedInboundSnapshotRef = useRef(false);

  const loadConversations = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("type", groupsMode ? "group" : "direct");
    if (search) {
      params.set("q", search);
    }
    const response = await fetch(`/api/conversations?${params.toString()}`);
    const data: ConversationListResponse = await response.json();
    setConversations(data.conversations);
  }, [search, groupsMode]);

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
          contactName: conversation.contact?.name ?? conversation.title ?? null,
          phone: conversation.contact?.phone ?? "",
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

  const defaultPhone = useMemo(
    () => activeConversation?.contact?.phone ?? draftPhone,
    [activeConversation, draftPhone],
  );
  const showConversationPane = isNewConversation || Boolean(conversationId);
  const isDraftConversation = isNewConversation && !activeConversation;
  const isAdmin = session?.user.role === "admin";
  const isGroupConversation = activeConversation?.type === "group";

  const handleCreateConversation = useCallback(
    async (payload: { name: string; phone: string; facility: string; address: string }) => {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name.trim() ? payload.name.trim() : null,
          phone: payload.phone.trim(),
          facility: payload.facility.trim() ? payload.facility.trim() : null,
          address: payload.address.trim() ? payload.address.trim() : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const formErrors = errorData.error?.fieldErrors;
        const firstFieldError = formErrors
          ? Object.values(formErrors).flat().find((message) => typeof message === "string")
          : null;
        throw new Error(
          (typeof firstFieldError === "string" ? firstFieldError : null) ??
            errorData.error?.formErrors?.[0] ??
            "Failed to save conversation.",
        );
      }

      const data = await response.json();
      setConversationId(data.conversation.id);
      setIsNewConversation(false);
      setDraftPhone("");
      setActiveConversation(data.conversation);
      await loadConversations();
    },
    [loadConversations],
  );

  const handleGroupCreated = useCallback(
    async (newConversationId: string) => {
      setConversationId(newConversationId);
      setIsNewConversation(false);
      setDraftPhone("");
      setIsNewGroupOpen(false);
      await loadConversations();
      await loadConversationDetail(newConversationId);
    },
    [loadConversations, loadConversationDetail],
  );

  const handleGroupSend = useCallback(
    async (id: string, body: string) => {
      const response = await fetch(`/api/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? "Failed to send message.");
      }

      await loadConversations();
      await loadConversationDetail(id);
    },
    [loadConversations, loadConversationDetail],
  );

  const handleDeleteConversation = useCallback(
    async (conversationIdToDelete: string) => {
      const response = await fetch(`/api/conversations/${conversationIdToDelete}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? "Failed to remove conversation.");
      }

      if (activeConversation?.id === conversationIdToDelete) {
        setActiveConversation(null);
        setConversationId(null);
        setIsNewConversation(false);
      }

      await loadConversations();
    },
    [activeConversation, loadConversations],
  );

  return (
    <VoiceCallProvider>
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-3 overflow-hidden lg:hidden">
        {!showConversationPane ? (
          <aside className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm"
              placeholder="Search name, phone, or facility"
            />
            {!groupsMode ? (
              <button
                className="rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white"
                onClick={() => {
                  setIsNewConversation(true);
                  setConversationId(null);
                  setDraftPhone("");
                  setActiveConversation(null);
                }}
              >
                New Conversation
              </button>
            ) : null}
            {groupsMode ? (
              <button
                className="rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm font-semibold text-indigo-700"
                onClick={() => setIsNewGroupOpen(true)}
              >
                New Group
              </button>
            ) : null}
            <ConversationList
              conversations={conversations}
              selectedConversationId={conversationId ?? undefined}
              isAdmin={isAdmin}
              onSelect={(id) => {
                setConversationId(id);
                setIsNewConversation(false);
                setDraftPhone("");
              }}
              onDelete={handleDeleteConversation}
            />
          </aside>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <button
              className="w-fit shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
              onClick={() => {
                setConversationId(null);
                setIsNewConversation(false);
                setDraftPhone("");
                setActiveConversation(null);
              }}
            >
              Back to conversations
            </button>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                <div className="shrink-0 space-y-3">
                  <ConversationHeader
                    conversationId={activeConversation?.id}
                    contactName={activeConversation?.contact?.name}
                    phone={activeConversation?.contact?.phone}
                    facility={activeConversation?.contact?.facility}
                    status={activeConversation?.status}
                    isDraft={isDraftConversation}
                    isAdmin={isAdmin}
                    isGroup={isGroupConversation}
                    title={activeConversation?.title}
                    participants={activeConversation?.participants}
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
                    onDeleteConversation={
                      activeConversation
                        ? () => handleDeleteConversation(activeConversation.id)
                        : undefined
                    }
                  />
                  <CallBar />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <MessageThread
                    messages={activeConversation?.messages ?? []}
                    callLogs={activeConversation?.callLogs ?? []}
                    conversationId={activeConversation?.id}
                    isGroup={isGroupConversation}
                    participants={activeConversation?.participants}
                  />
                </div>
                <div className="shrink-0">
                  {activeConversation && activeConversation.type === "group" ? (
                    <GroupComposerArea
                      conversationId={activeConversation.id}
                      twilioConversationSid={activeConversation.twilioConversationSid ?? null}
                      participants={activeConversation.participants ?? []}
                      templates={templates}
                      onSend={(body) => handleGroupSend(activeConversation.id, body)}
                      onRefresh={() => {
                        void loadConversationDetail(activeConversation.id);
                        void loadConversations();
                      }}
                    />
                  ) : (
                  <ConversationComposerArea
                templates={templates}
                isDraft={isDraftConversation}
                conversationId={activeConversation?.id}
                consentStatus={activeConversation?.contact?.consentStatus}
                defaultPhone={defaultPhone}
                onPhoneChange={setDraftPhone}
                onIntroSent={async () => {
                  if (!activeConversation) return;
                  await loadConversationDetail(activeConversation.id);
                  await loadConversations();
                }}
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
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <ContactDetailsCard
                contact={activeConversation?.contact ?? undefined}
                isDraft={isDraftConversation}
                draftPhone={draftPhone}
                onDraftPhoneChange={setDraftPhone}
                onCreate={handleCreateConversation}
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
              <CallLogsPanel callLogs={activeConversation?.callLogs ?? []} />
              </div>
            </div>
          </section>
        )}
      </div>

      <div className="hidden h-[calc(100dvh-6.5rem)] min-h-0 gap-4 overflow-hidden lg:flex">
        <aside className="flex min-h-0 w-[360px] flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            placeholder="Search name, phone, or facility"
          />
          {!groupsMode ? (
            <button
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setIsNewConversation(true);
                setConversationId(null);
                setDraftPhone("");
                setActiveConversation(null);
              }}
            >
              New Conversation
            </button>
          ) : null}
          {groupsMode ? (
            <button
              className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700"
              onClick={() => setIsNewGroupOpen(true)}
            >
              New Group
            </button>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              conversations={conversations}
              selectedConversationId={conversationId ?? undefined}
              isAdmin={isAdmin}
              onSelect={(id) => {
                setConversationId(id);
                setIsNewConversation(false);
                setDraftPhone("");
              }}
              onDelete={handleDeleteConversation}
            />
          </div>
        </aside>

        <section className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4 overflow-hidden">
          <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden">
            <div className="shrink-0 space-y-3">
              <ConversationHeader
                conversationId={activeConversation?.id}
                contactName={activeConversation?.contact?.name}
                phone={activeConversation?.contact?.phone}
                facility={activeConversation?.contact?.facility}
                status={activeConversation?.status}
                isDraft={isDraftConversation}
                isAdmin={isAdmin}
                isGroup={isGroupConversation}
                title={activeConversation?.title}
                participants={activeConversation?.participants}
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
                onDeleteConversation={
                  activeConversation
                    ? () => handleDeleteConversation(activeConversation.id)
                    : undefined
                }
              />
              <CallBar />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <MessageThread
                messages={activeConversation?.messages ?? []}
                callLogs={activeConversation?.callLogs ?? []}
                conversationId={activeConversation?.id}
                isGroup={isGroupConversation}
                participants={activeConversation?.participants}
              />
            </div>
            <div className="shrink-0">
              {activeConversation && activeConversation.type === "group" ? (
                <GroupComposerArea
                  conversationId={activeConversation.id}
                  twilioConversationSid={activeConversation.twilioConversationSid ?? null}
                  participants={activeConversation.participants ?? []}
                  templates={templates}
                  onSend={(body) => handleGroupSend(activeConversation.id, body)}
                  onRefresh={() => {
                    void loadConversationDetail(activeConversation.id);
                    void loadConversations();
                  }}
                />
              ) : (
              <ConversationComposerArea
                templates={templates}
                isDraft={isDraftConversation}
                conversationId={activeConversation?.id}
                consentStatus={activeConversation?.contact?.consentStatus}
                defaultPhone={defaultPhone}
                onPhoneChange={setDraftPhone}
                onIntroSent={async () => {
                  if (!activeConversation) return;
                  await loadConversationDetail(activeConversation.id);
                  await loadConversations();
                }}
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
              )}
            </div>
          </div>

          <div className="min-h-0 space-y-3 overflow-y-auto pr-1">
            <ContactDetailsCard
              contact={activeConversation?.contact ?? undefined}
              isDraft={isDraftConversation}
              draftPhone={draftPhone}
              onDraftPhoneChange={setDraftPhone}
              onCreate={handleCreateConversation}
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
            <CallLogsPanel callLogs={activeConversation?.callLogs ?? []} />
          </div>
        </section>
      </div>

      <NewGroupConversationModal
        open={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
        onCreated={handleGroupCreated}
      />
    </VoiceCallProvider>
  );
}
