import { describe, expect, it } from "vitest";
import {
  assertContactIdentityXor,
  contactDisplayIdentity,
  contactSecondaryIdentity,
  getContactTransport,
  getNotifyKind,
  isNotifyChannelContact,
  isNotifyContact,
  isNotifyIndividualContact,
  isSmsContact,
} from "@/lib/contact-identity";

describe("getContactTransport", () => {
  it("returns sms when only phone is set", () => {
    expect(getContactTransport({ phone: "+15551234567", notifyClientId: null })).toBe("sms");
  });

  it("returns notify when only notifyClientId is set", () => {
    expect(getContactTransport({ phone: null, notifyClientId: "client-1" })).toBe("notify");
  });

  it("returns notify when only notifyChannelId is set", () => {
    expect(getContactTransport({ phone: null, notifyChannelId: "channel-1" })).toBe("notify");
  });

  it("returns null for both or neither", () => {
    expect(getContactTransport({ phone: null, notifyClientId: null })).toBeNull();
    expect(getContactTransport({ phone: "+1", notifyClientId: "x" })).toBeNull();
    expect(
      getContactTransport({
        phone: null,
        notifyClientId: "x",
        notifyChannelId: "y",
      }),
    ).toBeNull();
  });
});

describe("getNotifyKind", () => {
  it("distinguishes individual and channel", () => {
    expect(getNotifyKind({ notifyClientId: "x" })).toBe("individual");
    expect(getNotifyKind({ notifyChannelId: "y" })).toBe("channel");
    expect(getNotifyKind({ phone: "+1" })).toBeNull();
  });
});

describe("assertContactIdentityXor", () => {
  it("throws when identity is invalid", () => {
    expect(() => assertContactIdentityXor({ phone: null, notifyClientId: null })).toThrow(
      /exactly one/,
    );
  });
});

describe("display helpers", () => {
  it("prefers name, then phone, then notify ids", () => {
    expect(contactDisplayIdentity({ name: "Ada", phone: "+1", notifyClientId: null })).toBe("Ada");
    expect(contactDisplayIdentity({ name: null, phone: "+1555", notifyClientId: null })).toBe("+1555");
    expect(contactDisplayIdentity({ name: null, phone: null, notifyClientId: "abc" })).toBe(
      "Notify abc",
    );
    expect(contactDisplayIdentity({ name: null, phone: null, notifyChannelId: "ch" })).toBe(
      "Notify channel ch",
    );
  });

  it("secondary identity returns phone or notify id", () => {
    expect(contactSecondaryIdentity({ phone: "+1555", notifyClientId: null })).toBe("+1555");
    expect(contactSecondaryIdentity({ phone: null, notifyClientId: "abc" })).toBe("abc");
    expect(contactSecondaryIdentity({ phone: null, notifyChannelId: "ch" })).toBe("ch");
  });

  it("type guards", () => {
    expect(isSmsContact({ phone: "+1", notifyClientId: null })).toBe(true);
    expect(isNotifyContact({ phone: null, notifyClientId: "x" })).toBe(true);
    expect(isNotifyIndividualContact({ notifyClientId: "x" })).toBe(true);
    expect(isNotifyChannelContact({ notifyChannelId: "y" })).toBe(true);
  });
});
