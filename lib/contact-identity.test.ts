import { describe, expect, it } from "vitest";
import {
  assertContactIdentityXor,
  contactDisplayIdentity,
  contactSecondaryIdentity,
  getContactTransport,
  isNotifyContact,
  isSmsContact,
} from "@/lib/contact-identity";

describe("getContactTransport", () => {
  it("returns sms when only phone is set", () => {
    expect(getContactTransport({ phone: "+15551234567", notifyClientId: null })).toBe("sms");
  });

  it("returns notify when only notifyClientId is set", () => {
    expect(getContactTransport({ phone: null, notifyClientId: "client-1" })).toBe("notify");
  });

  it("returns null for both or neither", () => {
    expect(getContactTransport({ phone: null, notifyClientId: null })).toBeNull();
    expect(getContactTransport({ phone: "+1", notifyClientId: "x" })).toBeNull();
  });
});

describe("assertContactIdentityXor", () => {
  it("throws when identity is invalid", () => {
    expect(() => assertContactIdentityXor({ phone: null, notifyClientId: null })).toThrow(/either/);
  });
});

describe("display helpers", () => {
  it("prefers name, then phone, then notify id", () => {
    expect(contactDisplayIdentity({ name: "Ada", phone: "+1", notifyClientId: null })).toBe("Ada");
    expect(contactDisplayIdentity({ name: null, phone: "+1555", notifyClientId: null })).toBe("+1555");
    expect(contactDisplayIdentity({ name: null, phone: null, notifyClientId: "abc" })).toBe("Notify abc");
  });

  it("secondary identity returns phone or notify id", () => {
    expect(contactSecondaryIdentity({ phone: "+1555", notifyClientId: null })).toBe("+1555");
    expect(contactSecondaryIdentity({ phone: null, notifyClientId: "abc" })).toBe("abc");
  });

  it("type guards", () => {
    expect(isSmsContact({ phone: "+1", notifyClientId: null })).toBe(true);
    expect(isNotifyContact({ phone: null, notifyClientId: "x" })).toBe(true);
  });
});
