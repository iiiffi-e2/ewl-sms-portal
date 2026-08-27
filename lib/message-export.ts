import { z } from "zod";

const EASTERN_TIME_ZONE = "America/New_York";

export const MESSAGE_EXPORT_HEADERS = [
  "Date",
  "Time",
  "Direction",
  "Status",
  "Body",
  "Contact Name",
  "Contact Phone",
  "Facility",
  "Sent By",
  "Conversation ID",
] as const;

export type MessageExportRow = {
  createdAt: Date;
  direction: string;
  status: string;
  body: string;
  contactName: string;
  contactPhone: string;
  facility: string;
  sentBy: string;
  conversationId: string;
};

function easternPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function formatEasternExportDateTime(date: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const dayPeriod = easternPart(parts, "dayPeriod").replace(/\./g, "").toUpperCase();

  return {
    date: `${easternPart(parts, "year")}-${easternPart(parts, "month")}-${easternPart(parts, "day")}`,
    time: `${easternPart(parts, "hour")}:${easternPart(parts, "minute")}${dayPeriod}`,
  };
}

export const messageExportQuerySchema = z
  .object({
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD")
      .optional(),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD")
      .optional(),
    contactId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
  })
  .refine(
    (value) => {
      if (!value.startDate || !value.endDate) {
        return true;
      }
      return value.startDate <= value.endDate;
    },
    { message: "startDate must be on or before endDate", path: ["startDate"] },
  );

export type MessageExportQuery = z.infer<typeof messageExportQuerySchema>;

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatMessageExportRow(row: MessageExportRow): string {
  const { date, time } = formatEasternExportDateTime(row.createdAt);

  return [
    date,
    time,
    row.direction,
    row.status,
    row.body,
    row.contactName,
    row.contactPhone,
    row.facility,
    row.sentBy,
    row.conversationId,
  ]
    .map((value) => escapeCsvField(value))
    .join(",");
}

export function buildMessagesCsv(rows: MessageExportRow[]): string {
  const header = MESSAGE_EXPORT_HEADERS.join(",");
  const body = rows.map(formatMessageExportRow).join("\r\n");
  return `${header}\r\n${body}`;
}

export function parseExportDateBoundaries(query: MessageExportQuery): {
  start?: Date;
  end?: Date;
} {
  const start = query.startDate
    ? new Date(`${query.startDate}T00:00:00.000Z`)
    : undefined;
  const end = query.endDate ? new Date(`${query.endDate}T23:59:59.999Z`) : undefined;

  return { start, end };
}

export function buildExportFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10);
  return `caretext-messages-${stamp}.csv`;
}

export const MESSAGE_EXPORT_BATCH_SIZE = 200;

export const MESSAGE_EXPORT_SELECT = {
  id: true,
  createdAt: true,
  direction: true,
  status: true,
  body: true,
  authorPhone: true,
  conversationId: true,
  user: { select: { name: true } },
  conversation: {
    select: {
      title: true,
      contact: {
        select: {
          name: true,
          phone: true,
          facility: true,
        },
      },
    },
  },
} as const;

export type MessageExportRecord = {
  createdAt: Date;
  direction: string;
  status: string;
  body: string;
  authorPhone: string | null;
  conversationId: string;
  user: { name: string | null } | null;
  conversation: {
    title: string | null;
    contact: {
      name: string | null;
      phone: string | null;
      facility: string | null;
    } | null;
  };
};

export function buildMessageExportWhere(query: MessageExportQuery) {
  const { start, end } = parseExportDateBoundaries(query);

  return {
    ...(start || end
      ? {
          createdAt: {
            ...(start ? { gte: start } : {}),
            ...(end ? { lte: end } : {}),
          },
        }
      : {}),
    ...(query.conversationId ? { conversationId: query.conversationId } : {}),
    ...(query.contactId ? { conversation: { contactId: query.contactId } } : {}),
  };
}

export function toMessageExportRow(message: MessageExportRecord): MessageExportRow {
  return {
    createdAt: message.createdAt,
    direction: message.direction,
    status: message.status,
    body: message.body,
    contactName: message.conversation.contact?.name ?? message.conversation.title ?? "",
    contactPhone: message.conversation.contact?.phone ?? message.authorPhone ?? "",
    facility: message.conversation.contact?.facility ?? "",
    sentBy: message.direction === "outbound" ? (message.user?.name ?? "") : "",
    conversationId: message.conversationId,
  };
}

export async function collectExportBatches<T extends { id: string }>(
  fetchBatch: (args: { take: number; cursor?: string }) => Promise<T[]>,
): Promise<T[]> {
  const results: T[] = [];
  let cursor: string | undefined;

  for (;;) {
    const batch = await fetchBatch({ take: MESSAGE_EXPORT_BATCH_SIZE, cursor });
    if (batch.length === 0) {
      break;
    }

    results.push(...batch);

    if (batch.length < MESSAGE_EXPORT_BATCH_SIZE) {
      break;
    }

    cursor = batch[batch.length - 1]?.id;
  }

  return results;
}
