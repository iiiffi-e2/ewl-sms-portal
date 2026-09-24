/** Don't start another full inbox history pull until the last one has settled. */
export const INBOX_SYNC_COOLDOWN_MS = 12_000;

/** Don't pull the same Notify thread's history again inside this window. */
export const CONVERSATION_SYNC_COOLDOWN_MS = 10_000;

export type InboxSyncGate = {
  inFlight: boolean;
  lastFinishedAt: number;
};

export function inboxSyncDecision(
  now: number,
  gate: InboxSyncGate,
  cooldownMs = INBOX_SYNC_COOLDOWN_MS,
): "start" | "join" | "skip" {
  if (gate.inFlight) return "join";
  if (gate.lastFinishedAt > 0 && now - gate.lastFinishedAt < cooldownMs) return "skip";
  return "start";
}

export function shouldSyncConversation(
  now: number,
  lastStartedAt: number | undefined,
  cooldownMs = CONVERSATION_SYNC_COOLDOWN_MS,
): boolean {
  if (lastStartedAt == null) return true;
  return now - lastStartedAt >= cooldownMs;
}
