import twilio from "twilio";
import { getTwilioFromNumber } from "@/lib/twilio";

export function getVoiceStatusCallbackUrl() {
  const baseUrl = process.env.NEXTAUTH_URL;
  if (!baseUrl) {
    throw new Error("NEXTAUTH_URL is not configured.");
  }
  return `${baseUrl.replace(/\/$/, "")}/api/webhooks/voice/status`;
}

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
