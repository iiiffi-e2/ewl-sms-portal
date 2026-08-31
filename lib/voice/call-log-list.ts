export const DEFAULT_CALL_LOG_LIMIT = 50;
export const MAX_CALL_LOG_LIMIT = 100;

const ACTIVE_STATUSES = new Set(["initiating", "ringing", "in_progress"]);

export type CallLogListRow = {
  id: string;
  phone: string;
  direction: string;
  status: string;
  outcome: string | null;
  durationSeconds: number | null;
  startedAt: Date;
  endedAt: Date | null;
  conversationId: string | null;
  initiatedBy: { id: string; name: string | null } | null;
};

export type CallLogListItem = {
  id: string;
  phone: string;
  direction: string;
  status: string;
  outcome: string | null;
  durationSeconds: number | null;
  startedAt: string;
  endedAt: string | null;
  conversationId: string | null;
  initiatedBy: { id: string; name: string | null } | null;
  contact: { id: string; name: string | null } | null;
};

export function parseCallLogListLimit(raw: string | null | undefined): number {
  if (raw == null || raw === "") {
    return DEFAULT_CALL_LOG_LIMIT;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_CALL_LOG_LIMIT;
  }
  return Math.min(parsed, MAX_CALL_LOG_LIMIT);
}

export function decorateCallLogsWithContacts(
  logs: CallLogListRow[],
  contactsByPhone: Map<string, { id: string; name: string | null }>,
): CallLogListItem[] {
  return logs.map((log) => ({
    id: log.id,
    phone: log.phone,
    direction: log.direction,
    status: log.status,
    outcome: log.outcome,
    durationSeconds: log.durationSeconds,
    startedAt: log.startedAt.toISOString(),
    endedAt: log.endedAt ? log.endedAt.toISOString() : null,
    conversationId: log.conversationId,
    initiatedBy: log.initiatedBy,
    contact: contactsByPhone.get(log.phone) ?? null,
  }));
}

export function canSaveContactFromCallLog(input: { hasContact: boolean; status: string }): boolean {
  return !input.hasContact && !ACTIVE_STATUSES.has(input.status);
}
