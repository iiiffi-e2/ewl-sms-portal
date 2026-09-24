import { describe, expect, it } from "vitest";
import {
  ACCOUNT_FRESH_MS,
  readFreshAccount,
  rememberAccount,
  resetAccountFreshness,
} from "@/lib/account-freshness";

describe("account freshness", () => {
  it("remembers a lookup for one poll window", () => {
    resetAccountFreshness();
    expect(readFreshAccount("user-1", 1_000)).toBeNull();

    rememberAccount("user-1", null, 1_000);
    expect(readFreshAccount("user-1", 1_000 + ACCOUNT_FRESH_MS - 1)).toEqual({
      disabledAt: null,
    });
    expect(readFreshAccount("user-1", 1_000 + ACCOUNT_FRESH_MS)).toBeNull();
  });
});
