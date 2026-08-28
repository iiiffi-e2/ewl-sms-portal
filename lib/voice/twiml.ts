import twilio from "twilio";
import { getTwilioFromNumber } from "@/lib/twilio";

function getVoiceBaseUrl() {
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    throw new Error("NEXTAUTH_URL is not configured.");
  }
  return baseUrl.replace(/\/$/, "");
}

export function getVoiceStatusCallbackUrl() {
  return `${getVoiceBaseUrl()}/api/webhooks/voice/status`;
}

export function getInboundDialActionUrl(callLogId: string) {
  return `${getVoiceBaseUrl()}/api/webhooks/voice/incoming-result?callLogId=${encodeURIComponent(callLogId)}`;
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
  conversationId: string;
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
    client.parameter({ name: "conversationId", value: input.conversationId });
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
