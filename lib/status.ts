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
    case "sending":
    case "accepted":
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

const OUTBOUND_RANK: Partial<Record<MessageStatus, number>> = {
  [MessageStatus.queued]: 0,
  [MessageStatus.sent]: 1,
  [MessageStatus.delivered]: 2,
};

/**
 * Twilio posts a callback for every status and retries any that 5xx.
 * Those retries arrive out of order, so a late `queued` callback must not
 * overwrite `sent` or `delivered` — that is what leaves a delivered SMS
 * stuck on "queued" in the thread.
 */
export function canAdvanceMessageStatus(current: MessageStatus, next: MessageStatus): boolean {
  if (current === next) return false;
  if (current === MessageStatus.received || next === MessageStatus.received) return false;
  if (current === MessageStatus.delivered || current === MessageStatus.failed) return false;
  if (next === MessageStatus.failed) {
    return current === MessageStatus.queued || current === MessageStatus.sent;
  }

  const currentRank = OUTBOUND_RANK[current];
  const nextRank = OUTBOUND_RANK[next];
  if (currentRank == null || nextRank == null) return false;
  return nextRank > currentRank;
}

export type TwilioStatusWrite =
  | {
      kind: "status";
      status: MessageStatus;
      twilioSid: string | null;
      errorMessage: string | null;
    }
  | { kind: "sid"; twilioSid: string };

export function planTwilioMessageStatusWrite(input: {
  currentStatus: MessageStatus;
  incomingStatus: MessageStatus;
  currentSid: string | null;
  incomingSid: string;
  errorMessage: string | null;
}): TwilioStatusWrite | null {
  if (input.currentSid && input.currentSid !== input.incomingSid) {
    return null;
  }

  const sidToSet = input.currentSid ? null : input.incomingSid;
  if (canAdvanceMessageStatus(input.currentStatus, input.incomingStatus)) {
    return {
      kind: "status",
      status: input.incomingStatus,
      twilioSid: sidToSet,
      errorMessage: input.errorMessage,
    };
  }

  if (sidToSet) {
    return { kind: "sid", twilioSid: sidToSet };
  }

  return null;
}

export function shouldRecordConsentStatusEvent(input: {
  isConsentIntro: boolean;
  currentStatus: MessageStatus;
  incomingStatus: MessageStatus;
}): boolean {
  if (!input.isConsentIntro) return false;
  if (
    input.incomingStatus !== MessageStatus.delivered &&
    input.incomingStatus !== MessageStatus.failed
  ) {
    return false;
  }

  return (
    input.currentStatus === input.incomingStatus ||
    canAdvanceMessageStatus(input.currentStatus, input.incomingStatus)
  );
}

export function buildSmsStatusCallbackUrl(
  messageId: string,
  origin = process.env.NEXTAUTH_URL,
): string {
  const base = (origin ?? "").replace(/\/$/, "");
  return `${base}/api/webhooks/sms-status?messageId=${encodeURIComponent(messageId)}`;
}
