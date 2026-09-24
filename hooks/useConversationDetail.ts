"use client";

import { useCallback, useEffect, useRef, useState, startTransition } from "react";
import { getConversationDetailRevision } from "@/lib/conversation-revision";
import { shouldSyncNotifyThread } from "@/lib/notify-inbox-sync";

type ConversationMessage = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
  authorPhone?: string | null;
  isSystemNote?: boolean;
  messageType?: "text" | "voice" | "photo" | "pdf";
  durationSeconds?: number | null;
  hasAttachment?: boolean;
};

export type ConversationDetail = {
  id: string;
  type: "direct" | "group";
  title?: string | null;
  twilioConversationSid?: string | null;
  status: string;
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
  participants?: Array<{
    status: string;
    contact: {
      id: string;
      name: string | null;
      phone: string | null;
      notifyClientId?: string | null;
      consentStatus: string;
    };
  }>;
  messages: ConversationMessage[];
  hasMoreMessages?: boolean;
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
const MESSAGE_PAGE_SIZE = 50;

// Union two message lists by id (later argument wins on conflicts, so fresh
// status updates overwrite stale copies) and return them oldest-first.
export function mergeMessages(
  base: ConversationMessage[],
  incoming: ConversationMessage[],
): ConversationMessage[] {
  const byId = new Map<string, ConversationMessage>();
  for (const message of base) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}

const OPTIMISTIC_ID_PREFIX = "optimistic-";

export function reconcileFetchedConversation(
  displayed: ConversationDetail | null | undefined,
  fetched: ConversationDetail,
): ConversationDetail {
  if (!displayed || displayed.id !== fetched.id) {
    return fetched;
  }

  const merged = mergeMessages(displayed.messages, fetched.messages);
  const displayedIds = new Set(displayed.messages.map((message) => message.id));
  const remainingNewOutbound = fetched.messages.filter(
    (message) => message.direction === "outbound" && !displayedIds.has(message.id),
  );
  const resolvedOptimisticIds = new Set<string>();

  for (const message of merged) {
    if (!message.id.startsWith(OPTIMISTIC_ID_PREFIX)) {
      continue;
    }

    const matchIndex = remainingNewOutbound.findIndex(
      (candidate) => candidate.body === message.body && candidate.direction === "outbound",
    );
    if (matchIndex >= 0) {
      resolvedOptimisticIds.add(message.id);
      remainingNewOutbound.splice(matchIndex, 1);
    }
  }

  return {
    ...fetched,
    messages: merged.filter((message) => !resolvedOptimisticIds.has(message.id)),
    hasMoreMessages: displayed.hasMoreMessages,
  };
}

export function useConversationDetail(initialConversationId?: string) {
  const [conversationId, setConversationIdState] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [activeConversation, setActiveConversationState] = useState<ConversationDetail | null>(
    null,
  );
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  const cacheRef = useRef(new Map<string, CacheEntry>());
  const selectedIdRef = useRef<string | null>(conversationId);
  const detailAbortRef = useRef<AbortController | null>(null);
  const detailFlightRef = useRef<{ id: string; promise: Promise<void> } | null>(null);
  const notifyThreadSyncAtRef = useRef(new Map<string, number>());
  const prefetchingRef = useRef(new Set<string>());

  const isLoadingDetail =
    conversationId !== null && activeConversation?.id !== conversationId;

  const cacheConversation = useCallback((conversation: ConversationDetail) => {
    cacheRef.current.set(conversation.id, {
      conversation,
      fetchedAt: Date.now(),
      revision: getConversationDetailRevision(conversation),
    });
  }, []);

  // Merge a freshly fetched page into whatever we already have so that loading a
  // recent page (on poll) never drops older messages the user paged in, and
  // "load earlier" availability is preserved.
  const ingestConversation = useCallback(
    (fetched: ConversationDetail, options?: { urgent?: boolean }) => {
      const writeCache = (merged: ConversationDetail) => {
        cacheRef.current.set(fetched.id, {
          conversation: merged,
          fetchedAt: Date.now(),
          revision: getConversationDetailRevision(merged),
        });
      };

      const apply = () => {
        if (selectedIdRef.current !== fetched.id) {
          const cached = cacheRef.current.get(fetched.id)?.conversation;
          writeCache(reconcileFetchedConversation(cached, fetched));
          return;
        }

        setActiveConversationState((current) => {
          const merged = reconcileFetchedConversation(
            current?.id === fetched.id
              ? current
              : (cacheRef.current.get(fetched.id)?.conversation ?? null),
            fetched,
          );
          writeCache(merged);

          if (
            current?.id === merged.id &&
            getConversationDetailRevision(current) === getConversationDetailRevision(merged)
          ) {
            return current;
          }
          return merged;
        });
      };

      if (options?.urgent) {
        apply();
      } else {
        startTransition(apply);
      }
    },
    [],
  );

  const loadConversationDetail = useCallback(
    (id: string, options?: { fresh?: boolean }) => {
      const inflight = detailFlightRef.current;
      // Polling used to abort and restart this request every few seconds. The
      // server kept running the aborted CommStack sync, so the next poll stacked
      // another one on top. Reuse the in-flight load for the same thread.
      // A fresh load (just after send) must not reuse that in-flight snapshot:
      // Accelerate may still be serving the message as `queued`.
      if (inflight?.id === id && !options?.fresh) {
        return inflight.promise;
      }

      detailAbortRef.current?.abort();
      const controller = new AbortController();
      detailAbortRef.current = controller;

      const promise = (async () => {
        try {
          const cacheBust = options?.fresh ? "?fresh=1" : "";
          const response = await fetch(`/api/conversations/${id}${cacheBust}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            return;
          }

          const data = await response.json();
          const conversation = data.conversation as ConversationDetail;
          const isNotify = Boolean(
            conversation.contact?.notifyClientId || conversation.contact?.notifyChannelId,
          );
          const lastSyncAt = notifyThreadSyncAtRef.current.get(id) ?? null;

          if (isNotify && shouldSyncNotifyThread(lastSyncAt, Date.now())) {
            notifyThreadSyncAtRef.current.set(id, Date.now());
            try {
              const syncResponse = await fetch(`/api/conversations/${id}/commstack-sync`, {
                method: "POST",
                signal: controller.signal,
              });
              const syncBody = syncResponse.ok
                ? await syncResponse.json().catch(() => null)
                : null;
              const imported = Number(syncBody?.imported ?? 0);
              if (imported > 0) {
                // Bypass Accelerate so newly imported Notify replies are visible immediately.
                const refreshed = await fetch(`/api/conversations/${id}?fresh=1`, {
                  signal: controller.signal,
                });
                if (refreshed.ok) {
                  const refreshedData = await refreshed.json();
                  ingestConversation(refreshedData.conversation as ConversationDetail, {
                    urgent: true,
                  });
                  return;
                }
              }
            } catch (syncError) {
              if (syncError instanceof DOMException && syncError.name === "AbortError") {
                return;
              }
              // Fall through to show the local thread if CommStack sync fails.
            }
          }

          ingestConversation(conversation);
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          throw error;
        }
      })();

      detailFlightRef.current = { id, promise };
      void promise.finally(() => {
        if (detailFlightRef.current?.promise === promise) {
          detailFlightRef.current = null;
        }
      });
      return promise;
    },
    [ingestConversation],
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
          ingestConversation(data.conversation as ConversationDetail);
        })
        .finally(() => {
          prefetchingRef.current.delete(id);
        });
    },
    [ingestConversation],
  );

  const loadOlderMessages = useCallback(async () => {
    const id = selectedIdRef.current;
    if (!id) {
      return;
    }

    const current = cacheRef.current.get(id)?.conversation;
    if (!current || !current.hasMoreMessages || current.messages.length === 0) {
      return;
    }

    const cursor = current.messages[0].id;
    setIsLoadingOlder(true);
    try {
      const response = await fetch(
        `/api/conversations/${id}/messages?cursor=${cursor}&limit=${MESSAGE_PAGE_SIZE}`,
      );
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      const older = data.messages as ConversationMessage[];
      const hasMore = Boolean(data.hasMore);

      const entry = cacheRef.current.get(id);
      if (entry) {
        const updated: ConversationDetail = {
          ...entry.conversation,
          messages: mergeMessages(older, entry.conversation.messages),
          hasMoreMessages: hasMore,
        };
        cacheRef.current.set(id, {
          conversation: updated,
          fetchedAt: entry.fetchedAt,
          revision: getConversationDetailRevision(updated),
        });

        if (selectedIdRef.current === id) {
          setActiveConversationState(updated);
        }
      }
    } finally {
      setIsLoadingOlder(false);
    }
  }, []);

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
        cacheConversation(updated);
        return updated;
      });
    },
    [cacheConversation],
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
    isLoadingOlder,
    hasMoreOlderMessages: activeConversation?.hasMoreMessages ?? false,
    loadConversationDetail,
    loadOlderMessages,
    prefetchConversationDetail,
    selectConversation,
    clearConversationSelection,
    setConversationDetail,
    updateActiveConversation,
    removeCachedConversation,
  };
}
