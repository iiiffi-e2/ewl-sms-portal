import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inboundDialResultStatus } from "@/lib/voice/inbound";
import {
  getWebhookRequestUrl,
  parseTwilioWebhookParams,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";

function twimlOk() {
  return new NextResponse("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function GET() {
  return twimlOk();
}

export async function POST(request: Request) {
  const params = await parseTwilioWebhookParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);

  if (!validateTwilioWebhookRequest({ signature, url, params })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const callLogId =
    params.callLogId ?? new URL(request.url).searchParams.get("callLogId") ?? undefined;
  const dialCallStatus = params.DialCallStatus ?? params.CallStatus;
  const duration = params.DialCallDuration
    ? Number.parseInt(params.DialCallDuration, 10)
    : params.CallDuration
      ? Number.parseInt(params.CallDuration, 10)
      : undefined;

  if (!callLogId || !dialCallStatus) {
    return twimlOk();
  }

  const callLog = await prisma.callLog.findUnique({
    where: { id: callLogId },
    select: { id: true, status: true, initiatedById: true, endedAt: true },
  });

  if (!callLog) {
    return twimlOk();
  }

  const nextStatus = inboundDialResultStatus({
    status: callLog.status,
    initiatedById: callLog.initiatedById,
    dialCallStatus,
  });

  if (!nextStatus) {
    return twimlOk();
  }

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      status: nextStatus,
      outcome: dialCallStatus,
      endedAt: callLog.endedAt ?? new Date(),
      ...(Number.isFinite(duration) ? { durationSeconds: duration } : {}),
    },
  });

  return twimlOk();
}
