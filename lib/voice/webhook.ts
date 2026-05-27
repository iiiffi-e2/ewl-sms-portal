import twilio from "twilio";

type ValidateWebhookParams = {
  signature: string | null;
  url: string;
  params: Record<string, string>;
};

export function validateTwilioWebhookRequest({
  signature,
  url,
  params,
}: ValidateWebhookParams): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signature) {
    return false;
  }

  return twilio.validateRequest(authToken, signature, url, params);
}

export async function parseTwilioWebhookParams(
  request: Request,
): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData();
    return Object.fromEntries(
      [...formData.entries()].map(([key, value]) => [key, value.toString()]),
    );
  }

  const text = await request.text();
  if (!text) {
    return {};
  }

  return Object.fromEntries(new URLSearchParams(text));
}

export function getWebhookRequestUrl(request: Request): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  const proto = forwardedProto ?? "https";

  if (host) {
    return `${proto}://${host}${new URL(request.url).pathname}`;
  }

  return request.url;
}
