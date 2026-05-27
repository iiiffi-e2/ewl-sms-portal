import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTerminalCallStatus, mapTwilioCallStatus } from "@/lib/voice/status";
import {
  getWebhookRequestUrl,
  parseTwilioWebhookParams,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";

export async function POST(request: Request) {
  const params = await parseTwilioWebhookParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);

  if (!validateTwilioWebhookRequest({ signature, url, params })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const callSid = params.CallSid;
  const callStatus = params.CallStatus ?? params.DialCallStatus;
  const callLogId =
    params.callLogId ?? new URL(request.url).searchParams.get("callLogId") ?? undefined;
  const duration = params.CallDuration ? Number.parseInt(params.CallDuration, 10) : undefined;

  if (!callSid || !callStatus) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mappedStatus = mapTwilioCallStatus(callStatus);

  const callLog = callLogId
    ? await prisma.callLog.findUnique({ where: { id: callLogId }, select: { id: true, endedAt: true } })
    : await prisma.callLog.findFirst({
        where: { twilioSid: callSid },
        select: { id: true, endedAt: true },
      });

  if (!callLog) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await prisma.callLog.update({
    where: { id: callLog.id },
    data: {
      twilioSid: callSid,
      status: mappedStatus,
      outcome: callStatus,
      ...(isTerminalCallStatus(mappedStatus)
        ? {
            endedAt: callLog.endedAt ?? new Date(),
            durationSeconds: Number.isFinite(duration) ? duration : undefined,
          }
        : {}),
    },
  });

  return NextResponse.json({ ok: true });
}
