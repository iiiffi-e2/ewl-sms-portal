import { z } from "zod";

export const MESSAGE_EXPORT_HEADERS = [
  "Message Time",
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
  messageTime: string;
  direction: string;
  status: string;
  body: string;
  contactName: string;
  contactPhone: string;
  facility: string;
  sentBy: string;
  conversationId: string;
};

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
  return [
    row.messageTime,
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
