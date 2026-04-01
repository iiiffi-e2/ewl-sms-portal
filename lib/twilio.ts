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
