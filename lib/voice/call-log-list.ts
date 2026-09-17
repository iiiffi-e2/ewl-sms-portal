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

export const CALL_LOG_STATUS_FILTER_OPTIONS: CallStatus[] = [
  CallStatus.completed,
  CallStatus.no_answer,
  CallStatus.busy,
  CallStatus.failed,
  CallStatus.canceled,
  CallStatus.initiating,
  CallStatus.ringing,
  CallStatus.in_progress,
];

const CALL_STATUS_VALUES = new Set<string>(Object.values(CallStatus));

export type CallLogListQuery = {
  q: string | null;
  startedFrom: Date | null;
  startedTo: Date | null;
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  status: CallStatus | null;
};

export type ParseCallLogListQueryResult =
  | { ok: true; query: CallLogListQuery }
  | { ok: false; error: string };

function blankToNull(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function isParseError(value: unknown): value is { error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

function parseOptionalDate(
  raw: string | null,
  field: "startedFrom" | "startedTo",
): Date | null | { error: string } {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { error: `${field} must be a valid datetime.` };
  }
  return date;
}

function parseOptionalNonNegativeInt(
  raw: string | null,
  field: "minDurationSeconds" | "maxDurationSeconds",
): number | null | { error: string } {
  if (!raw) {
    return null;
  }
  if (!/^\d+$/.test(raw)) {
    return { error: `${field} must be a non-negative integer.` };
  }
  return Number.parseInt(raw, 10);
}

export function parseCallLogListQuery(input: {
  q?: string | null;
  startedFrom?: string | null;
  startedTo?: string | null;
  minDurationSeconds?: string | null;
  maxDurationSeconds?: string | null;
  status?: string | null;
}): ParseCallLogListQueryResult {
  const q = blankToNull(input.q);
  const startedFromRaw = blankToNull(input.startedFrom);
  const startedToRaw = blankToNull(input.startedTo);
  const minRaw = blankToNull(input.minDurationSeconds);
  const maxRaw = blankToNull(input.maxDurationSeconds);
  const statusRaw = blankToNull(input.status);

  const startedFrom = parseOptionalDate(startedFromRaw, "startedFrom");
  if (isParseError(startedFrom)) {
    return { ok: false, error: startedFrom.error };
  }
  const startedTo = parseOptionalDate(startedToRaw, "startedTo");
  if (isParseError(startedTo)) {
    return { ok: false, error: startedTo.error };
  }
  if (startedFrom && startedTo && startedFrom.getTime() > startedTo.getTime()) {
    return { ok: false, error: "startedFrom must be on or before startedTo." };
  }

  const minDurationSeconds = parseOptionalNonNegativeInt(minRaw, "minDurationSeconds");
  if (isParseError(minDurationSeconds)) {
    return { ok: false, error: minDurationSeconds.error };
  }
  const maxDurationSeconds = parseOptionalNonNegativeInt(maxRaw, "maxDurationSeconds");
  if (isParseError(maxDurationSeconds)) {
    return { ok: false, error: maxDurationSeconds.error };
  }
  if (
    typeof minDurationSeconds === "number" &&
    typeof maxDurationSeconds === "number" &&
    minDurationSeconds > maxDurationSeconds
  ) {
    return { ok: false, error: "minDurationSeconds must be on or before maxDurationSeconds." };
  }

  let status: CallStatus | null = null;
  if (statusRaw) {
    if (!CALL_STATUS_VALUES.has(statusRaw)) {
      return { ok: false, error: "status is not a valid call status." };
    }
    status = statusRaw as CallStatus;
  }

  return {
    ok: true,
    query: {
      q,
      startedFrom: startedFrom ?? null,
      startedTo: startedTo ?? null,
      minDurationSeconds: typeof minDurationSeconds === "number" ? minDurationSeconds : null,
      maxDurationSeconds: typeof maxDurationSeconds === "number" ? maxDurationSeconds : null,
      status,
    },
  };
}

export function callLogListHasFilters(query: CallLogListQuery): boolean {
  return Boolean(
    query.q ||
      query.startedFrom ||
      query.startedTo ||
      query.minDurationSeconds != null ||
      query.maxDurationSeconds != null ||
      query.status,
  );
}

export function callLogSearchDigits(q: string): string {
  return q.replace(/\D/g, "");
}

export function buildCallLogListWhere(
  query: CallLogListQuery,
  contactPhones: string[],
): Prisma.CallLogWhereInput {
  const clauses: Prisma.CallLogWhereInput[] = [VISIBLE_CALL_LOG_WHERE];

  if (query.q) {
    const or: Prisma.CallLogWhereInput[] = [
      { phone: { contains: query.q, mode: "insensitive" } },
    ];
    const digits = callLogSearchDigits(query.q);
    if (digits && digits !== query.q) {
      or.push({ phone: { contains: digits, mode: "insensitive" } });
    }
    if (contactPhones.length > 0) {
      or.push({ phone: { in: contactPhones } });
    }
    clauses.push({ OR: or });
  }

  if (query.startedFrom || query.startedTo) {
    clauses.push({
      startedAt: {
        ...(query.startedFrom ? { gte: query.startedFrom } : {}),
        ...(query.startedTo ? { lte: query.startedTo } : {}),
      },
    });
  }

  if (query.minDurationSeconds != null || query.maxDurationSeconds != null) {
    clauses.push({
      durationSeconds: {
        not: null,
        ...(query.minDurationSeconds != null ? { gte: query.minDurationSeconds } : {}),
        ...(query.maxDurationSeconds != null ? { lte: query.maxDurationSeconds } : {}),
      },
    });
  }

  if (query.status) {
    clauses.push({ status: query.status });
  }

  return { AND: clauses };
}

export function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export function buildCallLogListSearchParams(input: {
  page: number;
  limit?: number;
  q?: string | null;
  startedFrom?: string | null;
  startedTo?: string | null;
  minDurationSeconds?: string | null;
  maxDurationSeconds?: string | null;
  status?: string | null;
}): string {
  const params = new URLSearchParams();
  params.set("page", String(input.page));
  params.set("limit", String(input.limit ?? DEFAULT_CALL_LOG_LIMIT));
  const q = input.q?.trim();
  if (q) {
    params.set("q", q);
  }
  if (input.startedFrom) {
    params.set("startedFrom", input.startedFrom);
  }
  if (input.startedTo) {
    params.set("startedTo", input.startedTo);
  }
  if (input.minDurationSeconds) {
    params.set("minDurationSeconds", input.minDurationSeconds);
  }
  if (input.maxDurationSeconds) {
    params.set("maxDurationSeconds", input.maxDurationSeconds);
  }
  if (input.status) {
    params.set("status", input.status);
  }
  return params.toString();
}

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
