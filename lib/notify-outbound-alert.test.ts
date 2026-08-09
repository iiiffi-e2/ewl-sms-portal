import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildNotifyAlertUrl,
  buildOutboundAlertPayload,
  resolveNotifyOutboundTimeoutMs,
} from "@/lib/notify-outbound-alert";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildNotifyAlertUrl", () => {
  it("strips scheme/trailing slash and builds palatiumCare path", () => {
    expect(
      buildNotifyAlertUrl(
        "https://qsscommbe3.notifync.com/",
        "deb769",
        "2026-08-08T12:00:00.000Z",
      ),
    ).toBe(
      "https://qsscommbe3.notifync.com/palatiumCare/deb769?eventDateTime=2026-08-08T12%3A00%3A00.000Z",
    );
  });
});

describe("buildOutboundAlertPayload", () => {
  it("builds Postman v2.0 Alert with room as location.name only", () => {
    expect(
      buildOutboundAlertPayload({
        id: "11111111-1111-1111-1111-111111111111",
        eventDateTime: "2026-08-08T12:00:00.000Z",
        room: "214",
      }),
    ).toEqual({
      version: "2.0",
      vendor: "Notify",
      id: "11111111-1111-1111-1111-111111111111",
      type: "Alert",
      eventDateTime: "2026-08-08T12:00:00.000Z",
      location: { name: "214" },
    });
  });
});

describe("resolveNotifyOutboundTimeoutMs", () => {
  it("defaults to 15000 and reads COMM_STACK_TIMEOUT_MS", () => {
    expect(resolveNotifyOutboundTimeoutMs()).toBe(15000);
    vi.stubEnv("COMM_STACK_TIMEOUT_MS", "8000");
    expect(resolveNotifyOutboundTimeoutMs()).toBe(8000);
    vi.stubEnv("COMM_STACK_TIMEOUT_MS", "not-a-number");
    expect(resolveNotifyOutboundTimeoutMs()).toBe(15000);
  });
});
