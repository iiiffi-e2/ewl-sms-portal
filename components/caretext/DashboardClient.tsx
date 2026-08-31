"use client";

import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useSession } from "next-auth/react";
import { ConversationList } from "@/components/caretext/ConversationList";
import { ConversationHeader } from "@/components/caretext/ConversationHeader";
import { ConversationStatusControls } from "@/components/caretext/ConversationStatusControls";
import { MessageThread } from "@/components/caretext/MessageThread";
import { ConversationComposerArea } from "@/components/caretext/ConversationComposerArea";
import { GroupComposerArea } from "@/components/caretext/GroupComposerArea";
import { NewGroupConversationModal } from "@/components/caretext/NewGroupConversationModal";
import { ContactDetailsCard } from "@/components/caretext/ContactDetailsCard";
import { InternalNotesPanel } from "@/components/caretext/InternalNotesPanel";
import { CallLogsPanel } from "@/components/caretext/CallLogsPanel";
import { CallBar } from "@/components/caretext/CallBar";
import { ConversationThreadLoading } from "@/components/caretext/ConversationThreadLoading";
import { mergeMessages, useConversationDetail } from "@/hooks/useConversationDetail";
import { getConversationsListRevision } from "@/lib/conversation-revision";
import { VOICE_MESSAGE_BODY } from "@/lib/voice-messages";
import { createVoiceSendFormData } from "@/lib/voice-recorder";

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
    phone: string | null;
    notifyClientId?: string | null;
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
      phone: string | null;
      notifyClientId: string | null;
      notifyChannelId: string | null;
      facility: string | null;
      address: string | null;
      notes: string | null;
      emergencyContactName: string | null;
      emergencyContactPhone: string | null;
      commStackAppId: string | null;
      commStackAppName: string | null;
      commStackBaseUrl: string | null;
      commStackPortalUserId: string | null;
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
    matchedMessage?: { body: string } | null;
  }>;
};

const POLL_INTERVAL_MS = 5000;
// Random extra delay added to each poll cycle so that tabs opened at the same
// time (e.g. start of a shift) don't all poll on the same 5s boundary. Without
// this, N tabs fire N identical /api/conversations queries in the same instant,
// all miss a cold Accelerate cache at once, and stampede the small connection
// pool before any one request can complete and seed the cache. Spreading polls
// across the window lets the first request seed the cache and the rest hit it.
const POLL_JITTER_MS = 2500;
const SEARCH_DEBOUNCE_MS = 300;
// Even without new messages, refresh the open thread occasionally so delivery
// status transitions (sent -> delivered) still surface within a bounded window.
const DETAIL_SAFETY_REFRESH_MS = 20_000;
// How often to backfill CommStack history across recent Notify threads (not just
// the open one). Kept slower than the list poll so we don't stampede CommStack.
const NOTIFY_INBOX_SYNC_MS = 15_000;

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
  const lastUrlConversationIdRef = useRef(initialConversationId);
  const seenInboundMessageIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedInboundSnapshotRef = useRef(false);
  const conversationsRevisionRef = useRef("");
  const detailLastFetchAtRef = useRef(0);
  const renderedDetailLastMessageIdRef = useRef<string | null>(null);
  const openNotifyConversationRef = useRef(false);
  const notifyInboxSyncAtRef = useRef(0);

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
    openNotifyConversationRef.current = Boolean(
      activeConversation?.contact?.notifyClientId ||
        activeConversation?.contact?.notifyChannelId,
    );
  }, [
    activeConversation?.contact?.notifyClientId,
    activeConversation?.contact?.notifyChannelId,
  ]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialConversationId || lastUrlConversationIdRef.current === initialConversationId) {
      return;
    }
    lastUrlConversationIdRef.current = initialConversationId;
    selectConversation(initialConversationId);
  }, [initialConversationId, selectConversation]);

  useEffect(() => {
    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      // Pull inbound Notify DMs for recent Notify threads (open or not) so the
      // inbox list / desktop notifications update without opening each chat.
      const now = Date.now();
      if (now - notifyInboxSyncAtRef.current >= NOTIFY_INBOX_SYNC_MS) {
        notifyInboxSyncAtRef.current = now;
        try {
          await fetch("/api/commstack/sync-inbox", { method: "POST" });
        } catch {
          // List poll below still runs; next cycle retries sync.
        }
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
      // Notify inbound often lands via CommStack history sync on detail load, not
      // the conversations list preview. Keep syncing the open Notify thread each
      // poll so replies appear without a manual refresh.
      const isNotifyConversation =
        Boolean(
          listConversation?.contact?.notifyClientId ||
            listConversation?.contact?.notifyChannelId,
        ) || openNotifyConversationRef.current;

      if (hasNewMessage || safetyElapsed || isNotifyConversation) {
        detailLastFetchAtRef.current = Date.now();
        void loadConversationDetail(conversationId);
      }
    };

    // Self-scheduling timeout (instead of setInterval) so we can add per-cycle
    // jitter and never overlap ticks. Each cycle waits the base interval plus a
    // random offset, which keeps concurrent tabs desynchronized over time.
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const scheduleNext = () => {
      if (cancelled) {
        return;
      }
      timeoutId = setTimeout(async () => {
        await tick();
        scheduleNext();
      }, POLL_INTERVAL_MS + Math.random() * POLL_JITTER_MS);
    };
    scheduleNext();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
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
          phone:
            conversation.contact?.phone ??
              conversation.contact?.notifyClientId ??
              conversation.contact?.notifyChannelId ??
              "",
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
      const notification = new Notification(`New message from ${sender}`, {
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
  const contactTransport =
    activeConversation?.contact?.notifyClientId ||
    activeConversation?.contact?.notifyChannelId
      ? "notify"
      : "sms";
  const showConversationPane = isNewConversation || Boolean(conversationId);
  const isDraftConversation = isNewConversation && !activeConversation;
  const isAdmin = session?.user.role === "admin";
  const isGroupConversation = activeConversation?.type === "group";

  const handleCreateConversation = useCallback(
    async (payload: {
      name: string;
      phone?: string;
      notifyClientId?: string;
      notifyChannelId?: string;
      facility: string;
      address: string;
      commStackAppId?: string;
      commStackAppName?: string;
      commStackBaseUrl?: string;
      commStackPortalUserId?: string;
    }) => {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name.trim() ? payload.name.trim() : null,
          ...(payload.notifyChannelId?.trim()
            ? {
                notifyChannelId: payload.notifyChannelId.trim(),
                commStackAppId: payload.commStackAppId?.trim(),
                commStackAppName: payload.commStackAppName?.trim(),
                commStackBaseUrl: payload.commStackBaseUrl?.trim(),
                commStackPortalUserId: payload.commStackPortalUserId?.trim(),
              }
            : payload.notifyClientId?.trim()
              ? {
                  notifyClientId: payload.notifyClientId.trim(),
                  commStackAppId: payload.commStackAppId?.trim(),
                  commStackAppName: payload.commStackAppName?.trim(),
                  commStackBaseUrl: payload.commStackBaseUrl?.trim(),
                  commStackPortalUserId: payload.commStackPortalUserId?.trim(),
                }
              : { phone: payload.phone?.trim() }),
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
      const optimisticId =
        activeConversation?.id === id ? `optimistic-${crypto.randomUUID()}` : null;

      const removeOptimistic = () => {
        if (!optimisticId) return;
        updateActiveConversation((current) =>
          current.id === id
            ? {
                ...current,
                messages: current.messages.filter((message) => message.id !== optimisticId),
              }
            : current,
        );
      };

      if (optimisticId) {
        updateActiveConversation((current) =>
          current.id === id
            ? {
                ...current,
                messages: [
                  ...current.messages,
                  {
                    id: optimisticId,
                    body,
                    direction: "outbound" as const,
                    status: "sending",
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : current,
        );
      }

      const response = await fetch(`/api/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      if (!response.ok) {
        removeOptimistic();
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? "Failed to send message.");
      }

      const data = await response.json().catch(() => null);
      if (optimisticId && data?.message) {
        updateActiveConversation((current) =>
          current.id === id
            ? {
                ...current,
                messages: mergeMessages(
                  current.messages.filter((message) => message.id !== optimisticId),
                  [
                    {
                      id: data.message.id,
                      body: data.message.body,
                      direction: "outbound" as const,
                      status: data.message.status,
                      createdAt: data.message.createdAt,
                    },
                  ],
                ),
              }
            : current,
        );
      }

      void Promise.all([loadConversations(), loadConversationDetail(id)]);
    },
    [activeConversation, loadConversations, loadConversationDetail, updateActiveConversation],
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
      // Optimistically render the outbound message immediately so it appears in
      // the thread the instant Send is pressed, rather than waiting on the POST
      // (which blocks on the Twilio API call) plus the follow-up refetches.
      const optimisticId =
        targetConversationId && activeConversation?.id === targetConversationId
          ? `optimistic-${crypto.randomUUID()}`
          : null;

      const removeOptimistic = () => {
        if (!optimisticId || !targetConversationId) return;
        updateActiveConversation((current) =>
          current.id === targetConversationId
            ? {
                ...current,
                messages: current.messages.filter((message) => message.id !== optimisticId),
              }
            : current,
        );
      };

      if (optimisticId && targetConversationId) {
        updateActiveConversation((current) =>
          current.id === targetConversationId
            ? {
                ...current,
                messages: [
                  ...current.messages,
                  {
                    id: optimisticId,
                    body,
                    direction: "outbound" as const,
                    status: "sending",
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : current,
        );
      }

      let response: Response;
      try {
        const notifyClientId = activeConversation?.contact?.notifyClientId;
        const notifyChannelId = activeConversation?.contact?.notifyChannelId;
        response = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            conversationId: targetConversationId,
            ...(notifyChannelId
              ? { notifyChannelId }
              : notifyClientId
                ? { notifyClientId }
                : { phone: targetConversationId ? defaultPhone : phone }),
          }),
        });
      } catch (error) {
        removeOptimistic();
        throw error instanceof Error ? error : new Error("Failed to send message.");
      }

      if (!response.ok) {
        removeOptimistic();
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? "Failed to send message.");
      }

      const data = await response.json();

      // Swap the temporary bubble for the persisted message so the follow-up
      // refetch/poll dedupes by the real id instead of duplicating the bubble.
      if (optimisticId && targetConversationId && data.message) {
        updateActiveConversation((current) =>
          current.id === targetConversationId
            ? {
                ...current,
                messages: mergeMessages(
                  current.messages.filter((message) => message.id !== optimisticId),
                  [
                    {
                      id: data.message.id,
                      body: data.message.body,
                      direction: "outbound" as const,
                      status: data.message.status,
                      createdAt: data.message.createdAt,
                    },
                  ],
                ),
              }
            : current,
        );
      }

      selectConversation(data.conversationId);
      setIsNewConversation(false);
      // Don't block the composer on inbox/detail refetch (Notify sync can take seconds).
      void Promise.all([
        loadConversations(),
        loadConversationDetail(data.conversationId),
      ]);
    },
    [
      activeConversation,
      defaultPhone,
      loadConversations,
      loadConversationDetail,
      selectConversation,
      updateActiveConversation,
    ],
  );

  const handleSendVoice = useCallback(
    async ({
      conversationId: targetConversationId,
      blob,
      durationSeconds,
    }: {
      conversationId: string;
      blob: Blob;
      durationSeconds: number;
    }) => {
      const optimisticId =
        activeConversation?.id === targetConversationId
          ? `optimistic-${crypto.randomUUID()}`
          : null;

      const removeOptimistic = () => {
        if (!optimisticId) return;
        updateActiveConversation((current) =>
          current.id === targetConversationId
            ? {
                ...current,
                messages: current.messages.filter((message) => message.id !== optimisticId),
              }
            : current,
        );
      };

      if (optimisticId) {
        updateActiveConversation((current) =>
          current.id === targetConversationId
            ? {
                ...current,
                messages: [
                  ...current.messages,
                  {
                    id: optimisticId,
                    body: VOICE_MESSAGE_BODY,
                    direction: "outbound" as const,
                    status: "sending",
                    createdAt: new Date().toISOString(),
                    messageType: "voice" as const,
                    durationSeconds,
                    hasAttachment: false,
                  },
                ],
              }
            : current,
        );
      }

      let response: Response;
      try {
        response = await fetch("/api/messages/send-voice", {
          method: "POST",
          body: createVoiceSendFormData({
            conversationId: targetConversationId,
            durationSeconds,
            blob,
          }),
        });
      } catch (error) {
        removeOptimistic();
        throw error instanceof Error ? error : new Error("Failed to send voice note.");
      }

      if (!response.ok) {
        removeOptimistic();
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? "Failed to send voice note.");
      }

      const data = await response.json();

      if (optimisticId && data.message) {
        updateActiveConversation((current) =>
          current.id === targetConversationId
            ? {
                ...current,
                messages: mergeMessages(
                  current.messages.filter((message) => message.id !== optimisticId),
                  [
                    {
                      id: data.message.id,
                      body: data.message.body,
                      direction: "outbound" as const,
                      status: data.message.status,
                      createdAt: data.message.createdAt,
                      messageType: data.message.messageType ?? "voice",
                      durationSeconds:
                        data.message.durationSeconds ?? durationSeconds,
                      hasAttachment: data.message.hasAttachment ?? true,
                    },
                  ],
                ),
              }
            : current,
        );
      }

      void Promise.all([
        loadConversations(),
        loadConversationDetail(targetConversationId),
      ]);
    },
    [
      activeConversation,
      loadConversations,
      loadConversationDetail,
      updateActiveConversation,
    ],
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
    <>
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-3 overflow-hidden lg:hidden">
        {!showConversationPane ? (
          <aside className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm"
              placeholder="Search name, phone, facility, or messages"
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
              searchTerm={debouncedSearch}
              onSelect={handleSelectConversation}
              onPrefetch={prefetchConversationDetail}
              onDelete={handleDeleteConversation}
            />
          </aside>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <button
              type="button"
              className="w-fit shrink-0 px-0 py-1 text-sm font-medium text-indigo-700 hover:underline"
              onClick={() => {
                clearConversationSelection();
                setIsNewConversation(false);
                setDraftPhone("");
              }}
            >
              ← Conversations
            </button>

            <div className="flex h-[calc(100dvh-11rem)] min-h-[22rem] shrink-0 flex-col gap-3">
              <div className="shrink-0 space-y-3">
                <ConversationHeader
                  variant="slim"
                  conversationId={activeConversation?.id}
                  contactName={activeConversation?.contact?.name}
                  phone={activeConversation?.contact?.phone}
                  notifyClientId={activeConversation?.contact?.notifyClientId}
                  notifyChannelId={activeConversation?.contact?.notifyChannelId}
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
                    transport={contactTransport}
                    defaultPhone={defaultPhone}
                    onPhoneChange={setDraftPhone}
                    onIntroSent={handleIntroSent}
                    onSend={handleSendMessage}
                    onSendVoice={handleSendVoice}
                  />
                )}
              </div>
            </div>

            <div className="shrink-0 space-y-3 pb-2">
              <div className="rounded-xl border border-border bg-white p-4">
                {activeConversation?.status ? (
                  <p className="mb-2 text-sm font-semibold">Status</p>
                ) : null}
                <ConversationStatusControls
                  status={activeConversation?.status}
                  onStatusChange={
                    activeConversation
                      ? async (status) => {
                          await fetch(`/api/conversations/${activeConversation.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status }),
                          });
                          await loadConversationDetail(activeConversation.id);
                          await loadConversations();
                        }
                      : undefined
                  }
                />
                {activeConversation?.contact?.phone ? (
                  <p className="mt-2 text-sm text-muted">{activeConversation.contact.phone}</p>
                ) : activeConversation?.contact?.notifyChannelId ? (
                  <p className="mt-2 text-sm text-muted">
                    Notify channel: {activeConversation.contact.notifyChannelId}
                  </p>
                ) : activeConversation?.contact?.notifyClientId ? (
                  <p className="mt-2 text-sm text-muted">
                    Notify: {activeConversation.contact.notifyClientId}
                  </p>
                ) : null}
              </div>
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
        )}
      </div>

      <div className="hidden h-[calc(100dvh-6.5rem)] min-h-0 flex-col gap-3 overflow-hidden lg:flex">
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <aside className="flex min-h-0 w-[360px] flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            placeholder="Search name, phone, facility, or messages"
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
              searchTerm={debouncedSearch}
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
                notifyClientId={activeConversation?.contact?.notifyClientId}
                notifyChannelId={activeConversation?.contact?.notifyChannelId}
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
                transport={contactTransport}
                defaultPhone={defaultPhone}
                onPhoneChange={setDraftPhone}
                onIntroSent={handleIntroSent}
                onSend={handleSendMessage}
                onSendVoice={handleSendVoice}
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
      </div>

      <NewGroupConversationModal
        open={isNewGroupOpen}
        onClose={() => setIsNewGroupOpen(false)}
        onCreated={handleGroupCreated}
      />
    </>
  );
}
