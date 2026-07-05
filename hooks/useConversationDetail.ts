"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { getConversationDetailRevision } from "@/lib/conversation-revision";

export type ConversationDetail = {
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
  participants?: Array<{
    status: string;
    contact: {
      id: string;
      name: string | null;
      phone: string;
      consentStatus: string;
    };
  }>;
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

type CacheEntry = {
  conversation: ConversationDetail;
  fetchedAt: number;
  revision: string;
};

const DETAIL_STALE_MS = 30_000;

export function useConversationDetail(initialConversationId?: string) {
  const [conversationId, setConversationIdState] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [activeConversation, setActiveConversationState] = useState<ConversationDetail | null>(
    null,
  );

  const cacheRef = useRef(new Map<string, CacheEntry>());
  const selectedIdRef = useRef<string | null>(conversationId);
  const detailAbortRef = useRef<AbortController | null>(null);
  const prefetchingRef = useRef(new Set<string>());

  const isLoadingDetail =
    conversationId !== null && activeConversation?.id !== conversationId;

  const writeCache = useCallback((conversation: ConversationDetail) => {
    cacheRef.current.set(conversation.id, {
      conversation,
      fetchedAt: Date.now(),
      revision: getConversationDetailRevision(conversation),
    });
  }, []);

  const applyConversationIfChanged = useCallback(
    (conversation: ConversationDetail, options?: { urgent?: boolean }) => {
      const revision = getConversationDetailRevision(conversation);
      writeCache(conversation);

      const update = () => {
        setActiveConversationState((current) => {
          if (
            current?.id === conversation.id &&
            getConversationDetailRevision(current) === revision
          ) {
            return current;
          }
          return conversation;
        });
      };

      if (options?.urgent) {
        update();
      } else {
        startTransition(update);
      }
    },
    [writeCache],
  );

  const loadConversationDetail = useCallback(
    async (id: string) => {
      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;

      try {
        const response = await fetch(`/api/conversations/${id}`, { signal: controller.signal });
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        const conversation = data.conversation as ConversationDetail;

        if (selectedIdRef.current === id) {
          applyConversationIfChanged(conversation);
        } else {
          writeCache(conversation);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        throw error;
      }
    },
    [applyConversationIfChanged, writeCache],
  );

  const prefetchConversationDetail = useCallback(
    (id: string) => {
      const cached = cacheRef.current.get(id);
      if (cached && Date.now() - cached.fetchedAt < DETAIL_STALE_MS) {
        return;
      }
      if (prefetchingRef.current.has(id)) {
        return;
      }

      prefetchingRef.current.add(id);

      void fetch(`/api/conversations/${id}`)
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const data = await response.json();
          const conversation = data.conversation as ConversationDetail;
          writeCache(conversation);

          if (selectedIdRef.current === id) {
            applyConversationIfChanged(conversation);
          }
        })
        .finally(() => {
          prefetchingRef.current.delete(id);
        });
    },
    [applyConversationIfChanged, writeCache],
  );

  const selectConversation = useCallback((id: string) => {
    setConversationIdState(id);
    const cached = cacheRef.current.get(id);
    setActiveConversationState(cached?.conversation ?? null);
  }, []);

  const clearConversationSelection = useCallback(() => {
    detailAbortRef.current?.abort();
    setConversationIdState(null);
    setActiveConversationState(null);
  }, []);

  const setConversationDetail = useCallback(
    (conversation: ConversationDetail) => {
      writeCache(conversation);
      setConversationIdState(conversation.id);
      setActiveConversationState(conversation);
    },
    [writeCache],
  );

  const updateActiveConversation = useCallback(
    (updater: (current: ConversationDetail) => ConversationDetail) => {
      setActiveConversationState((current) => {
        if (!current) {
          return current;
        }
        const updated = updater(current);
        writeCache(updated);
        return updated;
      });
    },
    [writeCache],
  );

  const removeCachedConversation = useCallback((id: string) => {
    cacheRef.current.delete(id);
  }, []);

  useEffect(() => {
    selectedIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      detailAbortRef.current?.abort();
      setActiveConversationState(null);
      return;
    }

    const cached = cacheRef.current.get(conversationId);
    if (cached && Date.now() - cached.fetchedAt < DETAIL_STALE_MS) {
      return;
    }

    void loadConversationDetail(conversationId);
  }, [conversationId, loadConversationDetail]);

  return {
    conversationId,
    activeConversation,
    isLoadingDetail,
    loadConversationDetail,
    prefetchConversationDetail,
    selectConversation,
    clearConversationSelection,
    setConversationDetail,
    updateActiveConversation,
    removeCachedConversation,
  };
}
