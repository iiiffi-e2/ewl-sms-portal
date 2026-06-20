import { describe, expect, it } from "vitest";
import {
  isProjectedAddressAuthor,
  parseConversationsEvent,
} from "@/lib/conversations-webhook";

describe("parseConversationsEvent", () => {
  it("returns the populated event for a valid onMessageAdded record", () => {
    const event = parseConversationsEvent({
      EventType: "onMessageAdded",
      ConversationSid: "CH123",
      MessageSid: "IM456",
      Author: "+15551234567",
      Body: "Hello group",
      ParticipantSid: "MB789",
    });

    expect(event).toEqual({
      EventType: "onMessageAdded",
      ConversationSid: "CH123",
      MessageSid: "IM456",
      Author: "+15551234567",
      Body: "Hello group",
      ParticipantSid: "MB789",
    });
  });

  it("returns the event with an empty body", () => {
    const event = parseConversationsEvent({
      EventType: "onMessageAdded",
      ConversationSid: "CH123",
      MessageSid: "IM456",
      Author: "+15551234567",
      Body: "",
    });

    expect(event).not.toBeNull();
    expect(event?.Body).toBe("");
    expect(event?.ParticipantSid).toBeUndefined();
  });

  it("returns null for a non-onMessageAdded event type", () => {
    const event = parseConversationsEvent({
      EventType: "onConversationAdded",
      ConversationSid: "CH123",
      MessageSid: "IM456",
      Author: "+15551234567",
      Body: "Hello",
    });

    expect(event).toBeNull();
  });

  it("returns null when MessageSid is missing", () => {
    const event = parseConversationsEvent({
      EventType: "onMessageAdded",
      ConversationSid: "CH123",
      Author: "+15551234567",
      Body: "Hello",
    });

    expect(event).toBeNull();
  });

  it("returns null when Author is missing", () => {
    const event = parseConversationsEvent({
      EventType: "onMessageAdded",
      ConversationSid: "CH123",
      MessageSid: "IM456",
      Body: "Hello",
    });

    expect(event).toBeNull();
  });
});

describe("isProjectedAddressAuthor", () => {
  it("returns true when the author equals the projected address", () => {
    expect(isProjectedAddressAuthor("+15550000000", "+15550000000")).toBe(true);
  });

  it("returns false when the author differs from the projected address", () => {
    expect(isProjectedAddressAuthor("+15551234567", "+15550000000")).toBe(false);
  });
});
