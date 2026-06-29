export type ConversationsMessageAddedEvent = {
  EventType: "onMessageAdded";
  ConversationSid: string;
  MessageSid: string;
  Author: string;
  Body: string;
  ParticipantSid?: string;
};

// Conversations post-event webhooks are application/x-www-form-urlencoded
// (NOT JSON). The caller parses the body with parseTwilioWebhookParams (reused
// from lib/voice/webhook.ts) and passes the resulting record here.
export function parseConversationsEvent(
  params: Record<string, string>,
): ConversationsMessageAddedEvent | null {
  if (params.EventType !== "onMessageAdded") {
    return null;
  }
  if (!params.ConversationSid || !params.MessageSid || !params.Author || params.Body === undefined) {
    return null;
  }
  return {
    EventType: "onMessageAdded",
    ConversationSid: params.ConversationSid,
    MessageSid: params.MessageSid,
    Author: params.Author,
    Body: params.Body,
    ParticipantSid: params.ParticipantSid,
  };
}

export function isProjectedAddressAuthor(author: string, projectedAddress: string): boolean {
  return author === projectedAddress;
}
