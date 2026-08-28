import twilio from "twilio";

const TOKEN_TTL_SECONDS = 3600;

function getVoiceEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

export function createVoiceAccessToken(identity: string): string {
  const accountSid = getVoiceEnv("TWILIO_ACCOUNT_SID");
  const apiKeySid = getVoiceEnv("TWILIO_API_KEY_SID");
  const apiKeySecret = getVoiceEnv("TWILIO_API_KEY_SECRET");
  const twimlAppSid = getVoiceEnv("TWILIO_TWIML_APP_SID");

  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: TOKEN_TTL_SECONDS,
  });

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true,
  });

  token.addGrant(voiceGrant);
  return token.toJwt();
}

export const VOICE_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;
