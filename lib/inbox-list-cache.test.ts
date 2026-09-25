import { describe, expect, it } from "vitest";
import {
  INBOX_LIST_SHARE_MS,
  getSharedInboxList,
  resetSharedInboxListCache,
} from "@/lib/inbox-list-cache";

describe("getSharedInboxList", () => {
  it("runs one load for concurrent callers and reuses it until the window ends", async () => {
    resetSharedInboxListCache();
    let calls = 0;
    let release: (value: string[]) => void = () => undefined;
    const load = () =>
      new Promise<string[]>((resolve) => {
        calls += 1;
        release = resolve;
      });

    const first = getSharedInboxList(load, 1_000);
    const second = getSharedInboxList(load, 1_000);
    release(["inbox"]);

    await expect(Promise.all([first, second])).resolves.toEqual([["inbox"], ["inbox"]]);
    expect(calls).toBe(1);

    await expect(getSharedInboxList(load, 1_000 + INBOX_LIST_SHARE_MS - 1)).resolves.toEqual([
      "inbox",
    ]);
    expect(calls).toBe(1);

    let thirdRelease: (value: string[]) => void = () => undefined;
    const thirdLoad = () =>
      new Promise<string[]>((resolve) => {
        calls += 1;
        thirdRelease = resolve;
      });
    const third = getSharedInboxList(thirdLoad, 1_000 + INBOX_LIST_SHARE_MS);
    thirdRelease(["fresh"]);
    await expect(third).resolves.toEqual(["fresh"]);
    expect(calls).toBe(2);
  });

  it("rejects callers on a failed load without leaking an unhandled rejection", async () => {
    resetSharedInboxListCache();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      const failure = new Error("P6004");
      await expect(getSharedInboxList(() => Promise.reject(failure), 1_000)).rejects.toBe(failure);
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);

      await expect(getSharedInboxList(async () => ["recovered"], 1_001)).resolves.toEqual([
        "recovered",
      ]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
