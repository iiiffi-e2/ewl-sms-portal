import { describe, expect, it } from "vitest";
import { extractRoomMention } from "@/lib/notify-room";

describe("extractRoomMention", () => {
  it("extracts Room N", () => {
    expect(extractRoomMention("Please check Room 214 now")).toBe("214");
  });

  it("extracts Rm / Apt / Apartment case-insensitively", () => {
    expect(extractRoomMention("go to rm 12B")).toBe("12B");
    expect(extractRoomMention("Apt 100 ready")).toBe("100");
    expect(extractRoomMention("Apartment 7A")).toBe("7A");
  });

  it("uses the first match only", () => {
    expect(extractRoomMention("Room 1 then Apt 2")).toBe("1");
  });

  it("returns null when no pattern matches", () => {
    expect(extractRoomMention("Please check on the resident")).toBeNull();
  });
});
