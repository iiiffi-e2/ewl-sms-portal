import { ConsentStatus } from "@prisma/client";

export const OPT_IN_INTRO_TEXT =
  "Hi, this is EyeWatch LIVE. You're receiving service-related SMS alerts for resident care and support. Reply STOP to opt out. Msg & data rates may apply.";

export const STOP_KEYWORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"] as const;

export type StopKeyword = (typeof STOP_KEYWORDS)[number];

export function matchStopKeyword(body: string): StopKeyword | null {
  const normalized = body.trim().toUpperCase();
  return STOP_KEYWORDS.find((keyword) => keyword === normalized) ?? null;
}

// Mirrors Twilio's default resubscribe keywords so our consent state stays in
// sync with carrier-level opt back in.
export const START_KEYWORDS = ["START", "UNSTOP", "YES"] as const;

export type StartKeyword = (typeof START_KEYWORDS)[number];

export function matchStartKeyword(body: string): StartKeyword | null {
  const normalized = body.trim().toUpperCase();
  return START_KEYWORDS.find((keyword) => keyword === normalized) ?? null;
}

export type ConsentGuardCode = "consent_required" | "consent_opted_out";

export type ConsentGuardResult =
  | { allowed: true }
  | { allowed: false; code: ConsentGuardCode; error: string };

export function evaluateOutboundConsent(status: ConsentStatus): ConsentGuardResult {
  switch (status) {
    case ConsentStatus.opted_in:
      return { allowed: true };
    case ConsentStatus.opted_out:
      return {
        allowed: false,
        code: "consent_opted_out",
        error: "This contact has opted out of SMS messages.",
      };
    case ConsentStatus.none:
    default:
      return {
        allowed: false,
        code: "consent_required",
        error: "Send the opt-in intro message before texting this contact.",
      };
  }
}
