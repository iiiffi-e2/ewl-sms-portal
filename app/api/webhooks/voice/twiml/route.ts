import { CallStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { buildOutboundDialTwiml, getVoiceStatusCallbackUrl } from "@/lib/voice/twiml";
import {
  getWebhookRequestUrl,
  parseTwilioWebhookParams,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";

function extractClientIdentity(from: string | undefined): string | null {
  if (!from?.startsWith("client:")) {
    return null;
  }
  return from.slice("client:".length);
}

export async function POST(request: Request) {
  const params = await parseTwilioWebhookParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);

  if (!validateTwilioWebhookRequest({ signature, url, params })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const identity = extractClientIdentity(params.From);
  const callLogId = params.callLogId;
  const to = params.To;

  if (!identity || !callLogId || !to) {
    return new NextResponse("<Response><Say>Invalid call request.</Say></Response>", {
      status: 400,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    select: { id: true, phone: true, initiatedById: true, status: true },
  });

  if (
    !callLog ||
    callLog.initiatedById !== identity ||
    callLog.status !== CallStatus.initiating ||
    callLog.phone !== normalizePhoneNumber(to)
  ) {
    return new NextResponse("<Response><Say>Unauthorized call request.</Say></Response>", {
      status: 403,
      headers: { "Content-Type": "text/xml" },
    });
  }

  const statusUrl = `${getVoiceStatusCallbackUrl()}?callLogId=${encodeURIComponent(callLogId)}`;
  const twiml = buildOutboundDialTwiml(callLog.phone, statusUrl);
  return new NextResponse(twiml, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
