import twilio from "twilio";

let twilioClient: ReturnType<typeof twilio> | null = null;

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured.");
  }

  if (!twilioClient) {
    twilioClient = twilio(accountSid, authToken);
  }

  return twilioClient;
}

export function getTwilioFromNumber() {
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!from) {
    throw new Error("TWILIO_PHONE_NUMBER is not configured.");
  }

  return from;
}

export function getTwilioConversationsServiceSid() {
  const sid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;
  if (!sid) {
    throw new Error("TWILIO_CONVERSATIONS_SERVICE_SID is not configured.");
  }
  return sid;
}

export function getTwilioMessagingServiceSid() {
  const sid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (!sid) {
    throw new Error("TWILIO_MESSAGING_SERVICE_SID is not configured.");
  }
  return sid;
}

export function getTwilioGroupProjectedAddress() {
  const address = process.env.TWILIO_GROUP_PROJECTED_ADDRESS;
  if (!address) {
    throw new Error("TWILIO_GROUP_PROJECTED_ADDRESS is not configured.");
  }
  return address;
}
