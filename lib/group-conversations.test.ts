import { describe, expect, it } from "vitest";
import {
  buildDefaultGroupTitle,
  countActiveParticipants,
  canActivateTwilioGroup,
  isGroupReadyForMessages,
} from "@/lib/group-conversations";

describe("countActiveParticipants", () => {
  it("counts only active participants", () => {
    expect(
      countActiveParticipants([
        { status: "active" },
        { status: "pending_intro" },
        { status: "active" },
        { status: "removed" },
      ]),
    ).toBe(2);
  });
});

describe("canActivateTwilioGroup", () => {
  it("requires at least two active participants", () => {
    expect(canActivateTwilioGroup(0)).toBe(false);
    expect(canActivateTwilioGroup(1)).toBe(false);
    expect(canActivateTwilioGroup(2)).toBe(true);
  });
});

describe("isGroupReadyForMessages", () => {
  it("requires twilioConversationSid", () => {
    expect(isGroupReadyForMessages(null)).toBe(false);
    expect(isGroupReadyForMessages("CHxxx")).toBe(true);
  });
});

describe("buildDefaultGroupTitle", () => {
  it("joins contact names and falls back to phone", () => {
    expect(
      buildDefaultGroupTitle([
        { name: "Jane Smith", phone: "+15551111111" },
        { name: null, phone: "+15552222222" },
      ]),
    ).toBe("Jane Smith, +15552222222");
  });

  it("truncates long lists", () => {
    const title = buildDefaultGroupTitle([
      { name: "A", phone: "+1" },
      { name: "B", phone: "+2" },
      { name: "C", phone: "+3" },
      { name: "D", phone: "+4" },
    ]);
    expect(title).toContain("A");
    expect(title).toContain("+ 1 more");
  });
});
