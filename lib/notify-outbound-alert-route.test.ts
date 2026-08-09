import { AlertStatus, MessageDirection } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { processOutboundAlertSend } from "@/lib/notify-outbound-alert";

const conversationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const messageId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const contactId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

describe("processOutboundAlertSend", () => {
  it("persists AlertStatus.failed when Notify returns non-2xx", async () => {
    const alertCreate = vi.fn().mockImplementation(async ({ data }) => ({
      id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      status: data.status,
      externalId: data.externalId,
      locationName: data.locationName,
      note: data.note ?? null,
    }));

    const db = {
      conversation: {
        findUnique: vi.fn().mockResolvedValue({
          id: conversationId,
          contactId,
          contact: {
            id: contactId,
            phone: null,
            notifyClientId: "11111111-1111-1111-1111-111111111111",
            notifyChannelId: null,
            notifyFacilityCode: "deb769",
            commStackBaseUrl: "https://qsscommbe3.notifync.com",
          },
        }),
      },
      message: {
        findFirst: vi.fn().mockResolvedValue({
          id: messageId,
          conversationId,
          direction: MessageDirection.outbound,
        }),
      },
      alert: {
        create: alertCreate,
      },
    };

    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "upstream unavailable",
    });

    const result = await processOutboundAlertSend({
      conversationId,
      messageId,
      room: "214",
      note: "hall call",
      sdkToken: "test-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      db: db as never,
    });

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: expect.stringMatching(/notify|failed|503/i),
    });
    expect(alertCreate).toHaveBeenCalledTimes(1);
    expect(alertCreate.mock.calls[0][0].data.status).toBe(AlertStatus.failed);
  });
});
