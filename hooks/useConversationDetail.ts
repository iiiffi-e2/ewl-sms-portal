"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

export function useConversationDetail(initialConversationId?: string) {
  const [conversationId, setConversationIdState] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [activeConversation, setActiveConversationState] = useState<ConversationDetail | null>(
    null,
  );

  const cacheRef = useRef(new Map<string, ConversationDetail>());
  const selectedIdRef = useRef<string | null>(conversationId);
  const detailAbortRef = useRef<AbortController | null>(null);
  const prefetchingRef = useRef(new Set<string>());

  const isLoadingDetail =
    conversationId !== null && activeConversation?.id !== conversationId;

  const cacheConversation = useCallback((conversation: ConversationDetail) => {
    cacheRef.current.set(conversation.id, conversation);
  }, []);

  const loadConversationDetail = useCallback(async (id: string) => {
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
      cacheRef.current.set(id, conversation);

      if (selectedIdRef.current === id) {
        setActiveConversationState(conversation);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      throw error;
    }
  }, []);

  const prefetchConversationDetail = useCallback((id: string) => {
    if (cacheRef.current.has(id) || prefetchingRef.current.has(id)) {
      return;
    }

    prefetchingRef.current.add(id);

    void fetch(`/api/conversations/${id}`)
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        cacheRef.current.set(id, data.conversation as ConversationDetail);
      })
      .finally(() => {
        prefetchingRef.current.delete(id);
      });
  }, []);

  const selectConversation = useCallback((id: string) => {
    setConversationIdState(id);
    const cached = cacheRef.current.get(id);
    setActiveConversationState(cached ?? null);
  }, []);

  const clearConversationSelection = useCallback(() => {
    detailAbortRef.current?.abort();
    setConversationIdState(null);
    setActiveConversationState(null);
  }, []);

  const setConversationDetail = useCallback(
    (conversation: ConversationDetail) => {
      cacheConversation(conversation);
      setConversationIdState(conversation.id);
      setActiveConversationState(conversation);
    },
    [cacheConversation],
  );

  const updateActiveConversation = useCallback(
    (updater: (current: ConversationDetail) => ConversationDetail) => {
      setActiveConversationState((current) => {
        if (!current) {
          return current;
        }
        const updated = updater(current);
        cacheRef.current.set(updated.id, updated);
        return updated;
      });
    },
    [],
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
