import { describe, expect, it } from "vitest";
import { formatCallThreadTitle } from "@/lib/call-log-display";

describe("formatCallThreadTitle", () => {
  it("labels outbound calls as placed", () => {
    expect(formatCallThreadTitle({ direction: "outbound", status: "completed" })).toBe(
      "Call placed",
    );
  });

  it("labels inbound connected calls as incoming", () => {
    expect(formatCallThreadTitle({ direction: "inbound", status: "completed" })).toBe(
      "Incoming call",
    );
    expect(formatCallThreadTitle({ direction: "inbound", status: "in_progress" })).toBe(
      "Incoming call",
    );
  });

  it("labels missed inbound calls", () => {
    expect(formatCallThreadTitle({ direction: "inbound", status: "no_answer" })).toBe(
      "Missed call",
    );
    expect(formatCallThreadTitle({ direction: "inbound", status: "canceled" })).toBe(
      "Missed call",
    );
    expect(formatCallThreadTitle({ direction: "inbound", status: "busy" })).toBe("Missed call");
  });
});
