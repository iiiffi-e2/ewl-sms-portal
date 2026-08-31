import { describe, expect, it } from "vitest";
import {
  appendDialerDigit,
  backspaceDialerInput,
  canPlaceDialerCall,
  formatDialerDisplay,
} from "@/lib/dialer";

describe("appendDialerDigit", () => {
  it("appends keypad digits and * #", () => {
    expect(appendDialerDigit("", "5")).toBe("5");
    expect(appendDialerDigit("5", "5")).toBe("55");
    expect(appendDialerDigit("55", "*")).toBe("55*");
    expect(appendDialerDigit("55*", "#")).toBe("55*#");
  });

  it("ignores unexpected characters", () => {
    expect(appendDialerDigit("55", "a")).toBe("55");
  });
});

describe("backspaceDialerInput", () => {
  it("removes the last character", () => {
    expect(backspaceDialerInput("555")).toBe("55");
    expect(backspaceDialerInput("")).toBe("");
  });
});

describe("canPlaceDialerCall", () => {
  it("accepts a complete US number", () => {
    expect(canPlaceDialerCall("4693230954")).toBe(true);
    expect(canPlaceDialerCall("+14693230954")).toBe(true);
  });

  it("rejects a short number", () => {
    expect(canPlaceDialerCall("469")).toBe(false);
  });
});

describe("formatDialerDisplay", () => {
  it("formats 10-digit US numbers as (XXX) XXX-XXXX", () => {
    expect(formatDialerDisplay("4693230954")).toBe("(469) 323-0954");
  });

  it("leaves incomplete input as typed digits", () => {
    expect(formatDialerDisplay("469")).toBe("469");
  });
});
