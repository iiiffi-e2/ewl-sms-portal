import { describe, expect, it } from "vitest";
import { candidateNotifyClientIds, parseNotifyAlertPayload } from "@/lib/notify-alerts";

describe("parseNotifyAlertPayload", () => {
  it("accepts a valid Alert payload", () => {
    const parsed = parseNotifyAlertPayload({
      version: "2.0",
      vendor: "Notify",
      id: "01",
      type: "Alert",
      eventDateTime: "2025-06-05T12:40:42.751884+00",
      location: { name: "Apt 100", building: "Main" },
      resident: { firstName: "Test", lastName: "Resident" },
      device: { name: "Pull Cord", type: "Pull Cord" },
    });
    expect(parsed?.id).toBe("01");
    expect(parsed?.type).toBe("Alert");
  });

  it("rejects missing fields", () => {
    expect(parseNotifyAlertPayload({ id: "01", type: "Alert" })).toBeNull();
    expect(parseNotifyAlertPayload(null)).toBeNull();
  });
});

describe("candidateNotifyClientIds", () => {
  it("uses payload id as the primary match candidate", () => {
    expect(
      candidateNotifyClientIds({
        id: "client-abc",
        type: "Alert",
        eventDateTime: "2025-06-05T12:40:42.751884+00",
      }),
    ).toEqual(["client-abc"]);
  });
});
