"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ConversationList } from "@/components/caretext/ConversationList";
import { MessageThread } from "@/components/caretext/MessageThread";
import { ConversationComposerArea } from "@/components/caretext/ConversationComposerArea";
import { VoiceCallProvider } from "@/components/caretext/VoiceCallProvider";
import { CallBar } from "@/components/caretext/CallBar";
import { EmbedConversationHeader } from "@/components/caretext/EmbedConversationHeader";
import { EmbedNewConversationForm } from "@/components/caretext/EmbedNewConversationForm";

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
      consentStatus: "none" | "opted_in" | "opted_out";
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
    consentStatus: "none" | "opted_in" | "opted_out";
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

export function EmbedInboxClient({ initialConversationId }: { initialConversationId?: string }) {
  const [search, setSearch] = useState("");
  const [isNewConversation, setIsNewConversation] = useState(false);
  const [draftPhone, setDraftPhone] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId ?? null);
  const [conversations, setConversations] = useState<ConversationListResponse["conversations"]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);

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

  const defaultPhone = useMemo(
    () => activeConversation?.contact.phone ?? draftPhone,
    [activeConversation, draftPhone],
  );
  const showConversationPane = isNewConversation || Boolean(conversationId);
  const isDraftConversation = isNewConversation && !activeConversation;

  const handleCreateConversation = useCallback(
    async (payload: { name: string; phone: string }) => {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name.trim() ? payload.name.trim() : null,
          phone: payload.phone.trim(),
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
      setConversationId(data.conversationId);
      setIsNewConversation(false);
      await loadConversations();
      await loadConversationDetail(data.conversationId);
    },
    [defaultPhone, loadConversationDetail, loadConversations],
  );

  const resetConversationPane = useCallback(() => {
    setConversationId(null);
    setIsNewConversation(false);
    setDraftPhone("");
    setActiveConversation(null);
  }, []);

  const startNewConversation = useCallback(() => {
    setIsNewConversation(true);
    setConversationId(null);
    setDraftPhone("");
    setActiveConversation(null);
  }, []);

  const conversationPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="shrink-0 space-y-3">
        <EmbedConversationHeader
          conversationId={activeConversation?.id}
          contactName={activeConversation?.contact.name}
          phone={activeConversation?.contact.phone ?? (isDraftConversation ? draftPhone : undefined)}
          isDraft={isDraftConversation}
        />
        {!isDraftConversation ? <CallBar /> : null}
      </div>
      {isDraftConversation ? (
        <EmbedNewConversationForm
          onCreate={async (payload) => {
            setDraftPhone(payload.phone);
            await handleCreateConversation(payload);
          }}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-hidden">
            <MessageThread
              messages={activeConversation?.messages ?? []}
              callLogs={activeConversation?.callLogs ?? []}
              conversationId={activeConversation?.id}
            />
          </div>
          <div className="shrink-0">
            <ConversationComposerArea
              templates={templates}
              isDraft={false}
              conversationId={activeConversation?.id}
              consentStatus={activeConversation?.contact.consentStatus}
              defaultPhone={defaultPhone}
              onPhoneChange={setDraftPhone}
              onIntroSent={async () => {
                if (!activeConversation) return;
                await loadConversationDetail(activeConversation.id);
                await loadConversations();
              }}
              onSend={handleSendMessage}
            />
          </div>
        </>
      )}
    </div>
  );

  const listAside = (
    <>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
        placeholder="Search name, phone, or facility"
      />
      <button
        type="button"
        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
        onClick={startNewConversation}
      >
        New Conversation
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ConversationList
          conversations={conversations}
          selectedConversationId={conversationId ?? undefined}
          isAdmin={false}
          onSelect={(id) => {
            setConversationId(id);
            setIsNewConversation(false);
            setDraftPhone("");
          }}
        />
      </div>
    </>
  );

  return (
    <VoiceCallProvider>
      <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col gap-3 overflow-hidden lg:hidden">
        {!showConversationPane ? (
          <aside className="flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
            {listAside}
          </aside>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <button
              type="button"
              className="w-fit shrink-0 rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium"
              onClick={resetConversationPane}
            >
              Back to conversations
            </button>
            {conversationPane}
          </section>
        )}
      </div>

      <div className="hidden h-[calc(100dvh-1rem)] min-h-0 gap-4 overflow-hidden lg:flex">
        <aside className="flex min-h-0 w-[360px] flex-col gap-3 rounded-xl border border-border bg-slate-50 p-3">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">{listAside}</div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
          {showConversationPane ? (
            conversationPane
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted">
              Select a conversation or start a new one.
            </div>
          )}
        </section>
      </div>
    </VoiceCallProvider>
  );
}
