import { beforeEach, describe, expect, it, vi } from "vitest";

const usersCreate = vi.fn();
const usersGet = vi.fn();
const sendDirect = vi.fn();

vi.mock("@notify/commstack-sdk", () => {
  class CommStackError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  class CommStack {
    forApplication() {
      return {
        users: { create: usersCreate, get: usersGet },
        messages: { sendDirect },
      };
    }
  }
  return { CommStack, CommStackError };
});

const RECEIVER = "11111111-1111-4111-8111-111111111111";
const PORTAL = "22222222-2222-4222-8222-222222222222";
const config = {
  baseUrl: "notify.test",
  appId: "app-1",
  appName: "App",
  portalUserId: PORTAL,
  env: "production" as const,
};

async function loadModule() {
  vi.resetModules();
  return import("@/lib/commstack");
}

beforeEach(async () => {
  const { CommStackError } = await import("@notify/commstack-sdk");
  usersCreate.mockReset();
  usersGet.mockReset();
  sendDirect.mockReset();
  usersCreate.mockRejectedValue(new (CommStackError as never as new (c: string, m: string) => Error)("ALREADY_EXISTS", "exists"));
  usersGet.mockImplementation(async (userId: string) => ({ userId, name: null, role: "mobile user" }));
  sendDirect.mockResolvedValue({ ackId: "ack-1" });
});

describe("Notify user checks on send", () => {
  it("checks the receiver and portal user once, not on every call path", async () => {
    const { ensureCommStackUser, sendCommStackDirectMessage } = await loadModule();

    await ensureCommStackUser(config, { userId: RECEIVER, name: "Resident" });
    await sendCommStackDirectMessage(config, { receiverUserId: RECEIVER, text: "hi" });

    expect(usersCreate).toHaveBeenCalledTimes(2);
    expect(usersGet).toHaveBeenCalledTimes(2);
    expect(sendDirect).toHaveBeenCalledTimes(1);
  });

  it("skips the checks entirely on the next send from the same instance", async () => {
    const { sendCommStackDirectMessage } = await loadModule();

    await sendCommStackDirectMessage(config, { receiverUserId: RECEIVER, text: "one" });
    usersCreate.mockClear();
    usersGet.mockClear();
    await sendCommStackDirectMessage(config, { receiverUserId: RECEIVER, text: "two" });

    expect(usersCreate).not.toHaveBeenCalled();
    expect(usersGet).not.toHaveBeenCalled();
    expect(sendDirect).toHaveBeenCalledTimes(2);
  });

  it("re-checks both users after a failed send", async () => {
    const { sendCommStackDirectMessage } = await loadModule();

    await sendCommStackDirectMessage(config, { receiverUserId: RECEIVER, text: "one" });
    sendDirect.mockRejectedValueOnce(new Error("NOT_FOUND"));
    await expect(
      sendCommStackDirectMessage(config, { receiverUserId: RECEIVER, text: "two" }),
    ).rejects.toThrow("NOT_FOUND");
    usersCreate.mockClear();
    await sendCommStackDirectMessage(config, { receiverUserId: RECEIVER, text: "three" });

    expect(usersCreate.mock.calls.map(([arg]) => arg.userId)).toEqual([RECEIVER, PORTAL]);
  });
});
