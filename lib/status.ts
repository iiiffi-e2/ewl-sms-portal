import { ConversationStatus, MessageStatus } from "@prisma/client";

export const conversationStatuses = [
  "new",
  "sms_sent",
  "awaiting_reply",
  "replied",
  "escalated",
  "closed",
] as const;

export type ConversationStatusValue = (typeof conversationStatuses)[number];

export function parseConversationStatus(value: ConversationStatusValue): ConversationStatus {
  return value as ConversationStatus;
}

export function serializeConversationStatus(value: ConversationStatus): ConversationStatusValue {
  return value as ConversationStatusValue;
}

export function mapTwilioStatusToMessageStatus(value: string): MessageStatus {
  switch (value.toLowerCase()) {
    case "queued":
      return MessageStatus.queued;
    case "sent":
      return MessageStatus.sent;
    case "delivered":
      return MessageStatus.delivered;
    case "failed":
    case "undelivered":
      return MessageStatus.failed;
    default:
      return MessageStatus.sent;
  }
}
