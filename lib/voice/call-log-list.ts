import { CallStatus, Prisma } from "@prisma/client";

export const DEFAULT_CALL_LOG_LIMIT = 50;
export const MAX_CALL_LOG_LIMIT = 100;

export function isPlaceholderCallLog(input: {
  status: string;
  outcome: string | null;
  twilioSid: string | null;
}): boolean {
  if (input.outcome === "stale") {
    return true;
  }
  return input.status === "canceled" && input.twilioSid == null;
}

export const VISIBLE_CALL_LOG_WHERE: Prisma.CallLogWhereInput = {
  NOT: {
    OR: [
      { outcome: "stale" },
      { status: CallStatus.canceled, twilioSid: null },
    ],
  },
};

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

export type CallLogPageItem = number | "ellipsis";

export function callLogPageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) {
    return 0;
  }
  return Math.ceil(total / pageSize);
}

export function buildCallLogPageItems(input: {
  page: number;
  pageCount: number;
  siblingCount?: number;
}): CallLogPageItem[] {
  const { pageCount } = input;
  if (pageCount <= 0) {
    return [];
  }
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const siblingCount = input.siblingCount ?? 1;
  const page = Math.min(pageCount, Math.max(1, input.page));
  const shown = new Set<number>([1, pageCount]);

  for (let index = page - siblingCount; index <= page + siblingCount; index += 1) {
    if (index >= 1 && index <= pageCount) {
      shown.add(index);
    }
  }

  if (page <= 2) {
    shown.add(3);
  }
  if (page >= pageCount - 1) {
    shown.add(pageCount - 2);
  }

  const items: CallLogPageItem[] = [];
  for (const number of [...shown].sort((left, right) => left - right)) {
    const previous = items[items.length - 1];
    if (typeof previous === "number") {
      if (number - previous === 2) {
        items.push(previous + 1);
      } else if (number - previous > 2) {
        items.push("ellipsis");
      }
    }
    items.push(number);
  }
  return items;
}

export function parseCallLogListPage(raw: string | null | undefined): number {
  if (raw == null || raw === "") {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
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
