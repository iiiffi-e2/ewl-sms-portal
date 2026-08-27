import { describe, expect, it } from "vitest";
import {
  MESSAGE_EXPORT_BATCH_SIZE,
  buildExportFilename,
  buildMessageExportWhere,
  buildMessagesCsv,
  collectExportBatches,
  escapeCsvField,
  formatEasternExportDateTime,
  formatMessageExportRow,
  messageExportQuerySchema,
  parseExportDateBoundaries,
  toMessageExportRow,
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

describe("formatEasternExportDateTime", () => {
  it("formats a winter UTC timestamp in Eastern Standard Time", () => {
    expect(formatEasternExportDateTime(new Date("2026-01-15T11:30:00.000Z"))).toEqual({
      date: "2026-01-15",
      time: "6:30AM",
    });
  });

  it("formats a summer UTC timestamp in Eastern Daylight Time", () => {
    expect(formatEasternExportDateTime(new Date("2026-08-26T00:06:30.996Z"))).toEqual({
      date: "2026-08-25",
      time: "8:06PM",
    });
  });

  it("uses a 12-hour clock at noon Eastern", () => {
    expect(formatEasternExportDateTime(new Date("2026-06-23T16:00:00.000Z"))).toEqual({
      date: "2026-06-23",
      time: "12:00PM",
    });
  });
});

describe("formatMessageExportRow", () => {
  it("joins escaped columns with Eastern date and time", () => {
    const row = formatMessageExportRow({
      createdAt: new Date("2026-01-15T11:30:00.000Z"),
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
    expect(row.startsWith("2026-01-15,6:30AM,outbound,delivered")).toBe(true);
    expect(row.endsWith(",conv-1")).toBe(true);
  });
});

describe("buildMessagesCsv", () => {
  it("includes header and CRLF-separated rows", () => {
    const csv = buildMessagesCsv([
      {
        createdAt: new Date("2026-01-15T11:30:00.000Z"),
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

    expect(csv.startsWith("Date,Time,Direction,Status,Body")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain("2026-01-15,6:30AM,inbound,received,Thanks");
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

describe("buildMessageExportWhere", () => {
  it("applies date, contact, and conversation filters", () => {
    expect(
      buildMessageExportWhere({
        startDate: "2026-06-01",
        endDate: "2026-06-02",
        contactId: "550e8400-e29b-41d4-a716-446655440000",
        conversationId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).toEqual({
      createdAt: {
        gte: new Date("2026-06-01T00:00:00.000Z"),
        lte: new Date("2026-06-02T23:59:59.999Z"),
      },
      conversationId: "550e8400-e29b-41d4-a716-446655440001",
      conversation: { contactId: "550e8400-e29b-41d4-a716-446655440000" },
    });
  });

  it("returns an empty where clause when no filters are set", () => {
    expect(buildMessageExportWhere({})).toEqual({});
  });
});

describe("toMessageExportRow", () => {
  it("maps selected message fields onto an export row", () => {
    expect(
      toMessageExportRow({
        createdAt: new Date("2026-01-15T11:30:00.000Z"),
        direction: "outbound",
        status: "delivered",
        body: "Hello",
        authorPhone: "+15550001111",
        conversationId: "conv-1",
        user: { name: "Nurse A" },
        conversation: {
          title: "Fallback title",
          contact: {
            name: "Jane Doe",
            phone: "+15551234567",
            facility: "North Wing",
          },
        },
      }),
    ).toEqual({
      createdAt: new Date("2026-01-15T11:30:00.000Z"),
      direction: "outbound",
      status: "delivered",
      body: "Hello",
      contactName: "Jane Doe",
      contactPhone: "+15551234567",
      facility: "North Wing",
      sentBy: "Nurse A",
      conversationId: "conv-1",
    });
  });
});

describe("collectExportBatches", () => {
  it("keeps the batch size under Accelerate's response limit", () => {
    expect(MESSAGE_EXPORT_BATCH_SIZE).toBe(200);
  });

  it("pages through cursor batches until a short page", async () => {
    const fetchBatch = async ({ cursor }: { take: number; cursor?: string }) => {
      if (!cursor) {
        return Array.from({ length: MESSAGE_EXPORT_BATCH_SIZE }, (_, index) => ({
          id: `full-${index}`,
        }));
      }
      return [{ id: "last" }];
    };

    await expect(collectExportBatches(fetchBatch)).resolves.toHaveLength(
      MESSAGE_EXPORT_BATCH_SIZE + 1,
    );
  });
});
