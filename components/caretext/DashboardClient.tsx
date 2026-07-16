"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
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
import { ConversationThreadLoading } from "@/components/caretext/ConversationThreadLoading";
import { useConversationDetail } from "@/hooks/useConversationDetail";
import { getConversationsListRevision } from "@/lib/conversation-revision";

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

const POLL_INTERVAL_MS = 5000;
const SEARCH_DEBOUNCE_MS = 300;
// Even without new messages, refresh the open thread occasionally so delivery
// status transitions (sent -> delivered) still surface within a bounded window.
const DETAIL_SAFETY_REFRESH_MS = 20_000;

export function DashboardClient({ initialConversationId }: { initialConversationId?: string }) {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [draftPhone, setDraftPhone] = useState("");
  const [conversations, setConversations] = useState<ConversationListResponse["conversations"]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const {
    conversationId,
    activeConversation,
    isLoadingDetail,
    isLoadingOlder,
    hasMoreOlderMessages,
    loadConversationDetail,
    loadOlderMessages,
    prefetchConversationDetail,
    selectConversation,
    clearConversationSelection,
    setConversationDetail,
    updateActiveConversation,
    removeCachedConversation,
  } = useConversationDetail(initialConversationId);
  const seenInboundMessageIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedInboundSnapshotRef = useRef(false);
  const conversationsRevisionRef = useRef("");
  const detailLastFetchAtRef = useRef(0);
  const renderedDetailLastMessageIdRef = useRef<string | null>(null);

  const loadConversations = useCallback(async () => {
    const response = await fetch(
      `/api/conversations${debouncedSearch ? `?q=${encodeURIComponent(debouncedSearch)}` : ""}`,
    );
    // A transient server/DB error (e.g. Accelerate 503/429) must not crash the
    // poll or clear the inbox; keep whatever we already have and try again next tick.
    if (!response.ok) {
      return null;
    }
    let data: ConversationListResponse;
    try {
      data = await response.json();
    } catch {
      return null;
    }
    const revision = `${debouncedSearch}:${getConversationsListRevision(data.conversations)}`;
    if (revision !== conversationsRevisionRef.current) {
      conversationsRevisionRef.current = revision;
      startTransition(() => {
        setConversations(data.conversations);
      });
    }
    return data.conversations;
  }, [debouncedSearch]);

  const loadTemplates = useCallback(async () => {
    const response = await fetch("/api/templates");
    if (!response.ok) {
      return;
    }
    try {
      const data = await response.json();
      setTemplates(data.templates);
    } catch {
      // Ignore transient failures; templates stay as-is until the next load.
    }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    renderedDetailLastMessageIdRef.current =
      activeConversation?.messages.at(-1)?.id ?? null;
  }, [activeConversation]);

  useEffect(() => {
    detailLastFetchAtRef.current = Date.now();
  }, [conversationId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      const list = await loadConversations();

      if (!conversationId || !list) {
        return;
      }

      const listConversation = list.find((conversation) => conversation.id === conversationId);
      const newestMessageId = listConversation?.messages[0]?.id ?? null;
      const hasNewMessage =
        newestMessageId !== null && newestMessageId !== renderedDetailLastMessageIdRef.current;
      const safetyElapsed = Date.now() - detailLastFetchAtRef.current >= DETAIL_SAFETY_REFRESH_MS;

      if (hasNewMessage || safetyElapsed) {
        detailLastFetchAtRef.current = Date.now();
        void loadConversationDetail(conversationId);
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
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
      setConversationDetail(data.conversation);
      setIsNewConversation(false);
      setDraftPhone("");
      await loadConversations();
    },
    [loadConversations, setConversationDetail],
  );

  const handleGroupCreated = useCallback(
    async (newConversationId: string) => {
      selectConversation(newConversationId);
      setIsNewConversation(false);
      setDraftPhone("");
      setIsNewGroupOpen(false);
      await loadConversations();
    },
    [loadConversations, selectConversation],
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

  const handleSendMessage = useCallback(
    async ({
      body,
      phone,
      conversationId: targetConversationId,
    }: {
      body: string;
      phone: string;
      conversationId?: string;
    }) => {
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
      selectConversation(data.conversationId);
      setIsNewConversation(false);
      await Promise.all([
        loadConversations(),
        loadConversationDetail(data.conversationId),
      ]);
    },
    [defaultPhone, loadConversations, loadConversationDetail, selectConversation],
  );

  const handleIntroSent = useCallback(async () => {
    if (!activeConversation) return;
    await loadConversationDetail(activeConversation.id);
    await loadConversations();
  }, [activeConversation, loadConversationDetail, loadConversations]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      selectConversation(id);
      setIsNewConversation(false);
      setDraftPhone("");
    },
    [selectConversation],
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
        clearConversationSelection();
        setIsNewConversation(false);
      }

      removeCachedConversation(conversationIdToDelete);
      await loadConversations();
    },
    [activeConversation, clearConversationSelection, loadConversations, removeCachedConversation],
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
            <button
              className="rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white"
              onClick={() => {
                setIsNewConversation(true);
                clearConversationSelection();
                setDraftPhone("");
              }}
            >
              New Conversation
            </button>
            <button
              className="rounded-lg border border-indigo-200 bg-white px-3 py-2.5 text-sm font-semibold text-indigo-700"
              onClick={() => setIsNewGroupOpen(true)}
            >
              New Group
            </button>
            <ConversationList
              conversations={conversations}
              selectedConversationId={conversationId ?? undefined}
              isAdmin={isAdmin}
              onSelect={handleSelectConversation}
              onPrefetch={prefetchConversationDetail}
              onDelete={handleDeleteConversation}
            />
          </aside>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <button
              className="w-fit shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
              onClick={() => {
                clearConversationSelection();
                setIsNewConversation(false);
                setDraftPhone("");
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
                  {isLoadingDetail ? (
                    <ConversationThreadLoading />
                  ) : (
                    <MessageThread
                      messages={activeConversation?.messages ?? []}
                      callLogs={activeConversation?.callLogs ?? []}
                      conversationId={conversationId ?? undefined}
                      isGroup={isGroupConversation}
                      participants={activeConversation?.participants}
                      hasMoreOlder={hasMoreOlderMessages}
                      isLoadingOlder={isLoadingOlder}
                      onLoadEarlier={loadOlderMessages}
                    />
                  )}
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
                onIntroSent={handleIntroSent}
                onSend={handleSendMessage}
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
                  updateActiveConversation((current) => ({
                    ...current,
                    notes: [newNote, ...current.notes],
                  }));
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
          <button
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            onClick={() => {
              setIsNewConversation(true);
              clearConversationSelection();
              setDraftPhone("");
            }}
          >
            New Conversation
          </button>
          <button
            className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700"
            onClick={() => setIsNewGroupOpen(true)}
          >
            New Group
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ConversationList
              conversations={conversations}
              selectedConversationId={conversationId ?? undefined}
              isAdmin={isAdmin}
              onSelect={handleSelectConversation}
              onPrefetch={prefetchConversationDetail}
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
              {isLoadingDetail ? (
                <ConversationThreadLoading />
              ) : (
                <MessageThread
                  messages={activeConversation?.messages ?? []}
                  callLogs={activeConversation?.callLogs ?? []}
                  conversationId={conversationId ?? undefined}
                  isGroup={isGroupConversation}
                  participants={activeConversation?.participants}
                  hasMoreOlder={hasMoreOlderMessages}
                  isLoadingOlder={isLoadingOlder}
                  onLoadEarlier={loadOlderMessages}
                />
              )}
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
                onIntroSent={handleIntroSent}
                onSend={handleSendMessage}
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
                updateActiveConversation((current) => ({
                  ...current,
                  notes: [newNote, ...current.notes],
                }));
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
