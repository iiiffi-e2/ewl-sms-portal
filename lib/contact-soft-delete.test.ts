import { describe, expect, it } from "vitest";
import {
  ACTIVE_CONTACT_WHERE,
  decideContactIdentityCreateAction,
  isSoftDeleted,
} from "@/lib/contact-soft-delete";

describe("ACTIVE_CONTACT_WHERE", () => {
  it("filters deletedAt null", () => {
    expect(ACTIVE_CONTACT_WHERE).toEqual({ deletedAt: null });
  });
});

describe("isSoftDeleted", () => {
  it("is true when deletedAt is set", () => {
    expect(isSoftDeleted({ deletedAt: new Date("2026-08-08T00:00:00Z") })).toBe(true);
  });

  it("is false when deletedAt is null", () => {
    expect(isSoftDeleted({ deletedAt: null })).toBe(false);
  });
});

describe("decideContactIdentityCreateAction", () => {
  it("restores soft-deleted contacts even with an active conversation", () => {
    expect(
      decideContactIdentityCreateAction({
        deletedAt: new Date("2026-08-08T00:00:00Z"),
        hasActiveConversation: true,
      }),
    ).toBe("restore");
  });

  it("conflicts when active contact already has an active conversation", () => {
    expect(
      decideContactIdentityCreateAction({
        deletedAt: null,
        hasActiveConversation: true,
      }),
    ).toBe("conflict");
  });

  it("reuses when active contact has no active conversation", () => {
    expect(
      decideContactIdentityCreateAction({
        deletedAt: null,
        hasActiveConversation: false,
      }),
    ).toBe("reuse");
  });
});
