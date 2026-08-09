import { AlertStatus, MessageDirection } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { processOutboundAlertSend } from "@/lib/notify-outbound-alert";

const conversationId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const messageId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const contactId = "cccccccc-cccc-cccc-cccc-cccccccccccc";

function createNotifyDb(alertCreate = vi.fn()) {
  const create = alertCreate.mockImplementation(async ({ data }) => ({
    id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    status: data.status,
    externalId: data.externalId,
    locationName: data.locationName,
    note: data.note ?? null,
  }));

  return {
    create,
    db: {
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
        create,
      },
    },
  };
}

describe("processOutboundAlertSend", () => {
  it("persists AlertStatus.failed when Notify returns non-2xx", async () => {
    const { create: alertCreate, db } = createNotifyDb();

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

  it("reuses Notify payload id/timestamp on failed audit when fetch throws", async () => {
    const { create: alertCreate, db } = createNotifyDb();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));

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
      error: "network down",
    });
    expect(alertCreate).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const requestBody = JSON.parse(
      (fetchImpl.mock.calls[0][1] as RequestInit).body as string,
    );
    const createData = alertCreate.mock.calls[0][0].data;
    expect(createData.status).toBe(AlertStatus.failed);
    expect(createData.externalId).toBe(requestBody.id);
    expect(createData.eventDateTime.toISOString()).toBe(requestBody.eventDateTime);
    expect(createData.payload.request).toEqual(requestBody);
  });

  it("times out Notify fetch and audits with correlated payload id", async () => {
    const { create: alertCreate, db } = createNotifyDb();
    const fetchImpl = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init.signal;
        if (!signal) {
          reject(new Error("missing abort signal"));
          return;
        }
        if (signal.aborted) {
          reject(
            new DOMException(
              "The operation was aborted due to timeout",
              "TimeoutError",
            ),
          );
          return;
        }
        signal.addEventListener("abort", () => {
          reject(
            new DOMException(
              "The operation was aborted due to timeout",
              "TimeoutError",
            ),
          );
        });
      });
    });

    const result = await processOutboundAlertSend({
      conversationId,
      messageId,
      room: "214",
      sdkToken: "test-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
      db: db as never,
    });

    expect(result).toEqual({
      ok: false,
      status: 502,
      error: "Notify alert request timed out.",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect((fetchImpl.mock.calls[0][1] as RequestInit).signal).toBeInstanceOf(
      AbortSignal,
    );

    const requestBody = JSON.parse(
      (fetchImpl.mock.calls[0][1] as RequestInit).body as string,
    );
    const createData = alertCreate.mock.calls[0][0].data;
    expect(createData.status).toBe(AlertStatus.failed);
    expect(createData.externalId).toBe(requestBody.id);
    expect(createData.eventDateTime.toISOString()).toBe(requestBody.eventDateTime);
  });
});
