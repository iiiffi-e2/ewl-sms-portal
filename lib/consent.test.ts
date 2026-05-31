import { describe, expect, it } from "vitest";
import { ConsentStatus } from "@prisma/client";
import {
  OPT_IN_INTRO_TEXT,
  STOP_KEYWORDS,
  START_KEYWORDS,
  matchStopKeyword,
  matchStartKeyword,
  evaluateOutboundConsent,
} from "@/lib/consent";

describe("OPT_IN_INTRO_TEXT", () => {
  it("matches the approved wording exactly", () => {
    expect(OPT_IN_INTRO_TEXT).toBe(
      "Hi, this is EyeWatch LIVE. You're receiving service-related SMS alerts for resident care and support. Reply STOP to opt out. Msg & data rates may apply.",
    );
  });
});

describe("matchStopKeyword", () => {
  it("matches each STOP-family keyword case-insensitively, ignoring surrounding whitespace", () => {
    for (const keyword of STOP_KEYWORDS) {
      expect(matchStopKeyword(`  ${keyword.toLowerCase()}  `)).toBe(keyword);
    }
  });

  it("returns null for non-stop messages", () => {
    expect(matchStopKeyword("hello there")).toBeNull();
    expect(matchStopKeyword("please stop calling me")).toBeNull();
    expect(matchStopKeyword("")).toBeNull();
  });
});

describe("matchStartKeyword", () => {
  it("matches each START-family keyword case-insensitively, ignoring surrounding whitespace", () => {
    for (const keyword of START_KEYWORDS) {
      expect(matchStartKeyword(`  ${keyword.toLowerCase()}  `)).toBe(keyword);
    }
  });

  it("returns null for non-start messages", () => {
    expect(matchStartKeyword("hello there")).toBeNull();
    expect(matchStartKeyword("let's get started")).toBeNull();
    expect(matchStartKeyword("STOP")).toBeNull();
    expect(matchStartKeyword("")).toBeNull();
  });
});

describe("evaluateOutboundConsent", () => {
  it("allows sending when opted_in", () => {
    expect(evaluateOutboundConsent(ConsentStatus.opted_in)).toEqual({ allowed: true });
  });

  it("blocks with consent_required when status is none", () => {
    const result = evaluateOutboundConsent(ConsentStatus.none);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("consent_required");
      expect(result.error).toMatch(/opt-in intro/i);
    }
  });

  it("blocks with consent_opted_out when status is opted_out", () => {
    const result = evaluateOutboundConsent(ConsentStatus.opted_out);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("consent_opted_out");
      expect(result.error).toMatch(/opted out/i);
    }
  });
});
