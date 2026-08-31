import twilio from "twilio";
import { getTwilioFromNumber } from "@/lib/twilio";

function getVoiceBaseUrl() {
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    throw new Error("NEXTAUTH_URL is not configured.");
  }

  const normalized = baseUrl.replace(/\/$/, "");
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("NEXTAUTH_URL is not a valid URL.");
  }

  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocal) {
    parsed.protocol = "https:";
  }
  return parsed.origin;
}

export function getVoiceStatusCallbackUrl() {
  return `${getVoiceBaseUrl()}/api/webhooks/voice/status`;
}

export function getInboundDialActionUrl(callLogId: string) {
  return `${getVoiceBaseUrl()}/api/webhooks/voice/incoming-result?callLogId=${encodeURIComponent(callLogId)}`;
}

export function inboundResultActionUrl(incomingRequestUrl: string, callLogId: string) {
  const incomingUrl = new URL(incomingRequestUrl);
  incomingUrl.pathname = "/api/webhooks/voice/incoming-result";
  incomingUrl.search = `callLogId=${encodeURIComponent(callLogId)}`;
  if (
    incomingUrl.protocol === "http:" &&
    incomingUrl.hostname !== "localhost" &&
    incomingUrl.hostname !== "127.0.0.1"
  ) {
    incomingUrl.protocol = "https:";
  }
  return incomingUrl.toString();
}

export const INBOUND_DIAL_TIMEOUT_SECONDS = 25;

export function buildOutboundDialTwiml(
  to: string,
  statusCallback?: string,
): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    callerId: getTwilioFromNumber(),
    answerOnBridge: true,
  });
  dial.number(
    {
      statusCallback: statusCallback ?? getVoiceStatusCallbackUrl(),
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    },
    to,
  );
  return response.toString();
}

export function buildInboundClientDialTwiml(input: {
  identities: string[];
  callLogId: string;
  conversationId?: string | null;
  contactName?: string | null;
  phone: string;
  actionUrl: string;
}): string {
  const response = new twilio.twiml.VoiceResponse();
  const dial = response.dial({
    timeout: INBOUND_DIAL_TIMEOUT_SECONDS,
    answerOnBridge: true,
    action: input.actionUrl,
    method: "POST",
  });

  for (const identity of input.identities) {
    const client = dial.client();
    client.identity(identity);
    client.parameter({ name: "callLogId", value: input.callLogId });
    if (input.conversationId) {
      client.parameter({ name: "conversationId", value: input.conversationId });
    }
    client.parameter({ name: "contactName", value: input.contactName ?? "" });
    client.parameter({ name: "phone", value: input.phone });
  }

  return response.toString();
}

export function buildHangupTwiml(): string {
  const response = new twilio.twiml.VoiceResponse();
  response.hangup();
  return response.toString();
}
