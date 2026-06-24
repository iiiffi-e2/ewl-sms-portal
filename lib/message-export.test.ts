import { describe, expect, it } from "vitest";
import {
  buildExportFilename,
  buildMessagesCsv,
  escapeCsvField,
  formatMessageExportRow,
  messageExportQuerySchema,
  parseExportDateBoundaries,
} from "@/lib/message-export";

describe("escapeCsvField", () => {
  it("returns plain values unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("quotes values with commas, quotes, or newlines", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvField("one,two")).toBe('"one,two"');
    expect(escapeCsvField("line\nbreak")).toBe('"line\nbreak"');
  });
});

describe("formatMessageExportRow", () => {
  it("joins escaped columns", () => {
    const row = formatMessageExportRow({
      messageTime: "2026-06-23T12:00:00.000Z",
      direction: "outbound",
      status: "delivered",
      body: 'Hi, "there"',
      contactName: "Jane Doe",
      contactPhone: "+15551234567",
      facility: "North Wing",
      sentBy: "Nurse A",
      conversationId: "conv-1",
    });

    expect(row).toContain('"Hi, ""there"""');
    expect(row.startsWith("2026-06-23T12:00:00.000Z,outbound,delivered")).toBe(true);
    expect(row.endsWith(",conv-1")).toBe(true);
  });
});

describe("buildMessagesCsv", () => {
  it("includes header and CRLF-separated rows", () => {
    const csv = buildMessagesCsv([
      {
        messageTime: "2026-06-23T12:00:00.000Z",
        direction: "inbound",
        status: "received",
        body: "Thanks",
        contactName: "Jane Doe",
        contactPhone: "+15551234567",
        facility: "",
        sentBy: "",
        conversationId: "conv-1",
      },
    ]);

    expect(csv.startsWith("Message Time,Direction,Status,Body")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("Thanks");
  });
});

describe("messageExportQuerySchema", () => {
  it("accepts valid optional filters", () => {
    const parsed = messageExportQuerySchema.safeParse({
      startDate: "2026-06-01",
      endDate: "2026-06-23",
      contactId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an inverted date range", () => {
    const parsed = messageExportQuerySchema.safeParse({
      startDate: "2026-06-23",
      endDate: "2026-06-01",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("parseExportDateBoundaries", () => {
  it("returns UTC day boundaries", () => {
    const { start, end } = parseExportDateBoundaries({
      startDate: "2026-06-01",
      endDate: "2026-06-02",
    });

    expect(start?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(end?.toISOString()).toBe("2026-06-02T23:59:59.999Z");
  });
});

describe("buildExportFilename", () => {
  it("includes the current date", () => {
    expect(buildExportFilename(new Date("2026-06-23T15:00:00.000Z"))).toBe(
      "caretext-messages-2026-06-23.csv",
    );
  });
});
