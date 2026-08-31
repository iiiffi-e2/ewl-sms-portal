import { CallDirection, CallMode, CallStatus, ConversationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureOpenPhoneConversation } from "@/lib/contact-conversation";
import { normalizePhoneNumber } from "@/lib/phone";
import { listInboundRingIdentities } from "@/lib/voice/presence-query";
import {
  buildHangupTwiml,
  buildInboundClientDialTwiml,
  inboundResultActionUrl,
} from "@/lib/voice/twiml";
import {
  getWebhookRequestUrl,
  parseTwilioWebhookParams,
  validateTwilioWebhookRequest,
} from "@/lib/voice/webhook";

function twimlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: { "Content-Type": "text/xml" },
  });
}

export async function POST(request: Request) {
  const params = await parseTwilioWebhookParams(request);
  const signature = request.headers.get("x-twilio-signature");
  const url = getWebhookRequestUrl(request);

  if (!validateTwilioWebhookRequest({ signature, url, params })) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 403 });
  }

  const from = params.From;
  const callSid = params.CallSid;

  if (!from || from.startsWith("client:") || !callSid) {
    return twimlResponse(buildHangupTwiml());
  }

  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhoneNumber(from);
  } catch {
    return twimlResponse(buildHangupTwiml());
  }

  const { contact, conversation } = await ensureOpenPhoneConversation(normalizedPhone);

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date() },
  });

  const callLog = await prisma.callLog.create({
    data: {
      conversationId: conversation.id,
      phone: normalizedPhone,
      twilioSid: callSid,
      direction: CallDirection.inbound,
      mode: CallMode.browser,
      status: CallStatus.ringing,
      startedAt: new Date(),
    },
  });

  const identities = await listInboundRingIdentities();
  if (identities.length === 0) {
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        status: CallStatus.no_answer,
        endedAt: new Date(),
        outcome: "no-staff",
      },
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.escalated,
        lastMessageAt: new Date(),
      },
    });
    return twimlResponse(buildHangupTwiml());
  }

  const twiml = buildInboundClientDialTwiml({
    identities,
    callLogId: callLog.id,
    conversationId: conversation.id,
    contactName: contact.name,
    phone: normalizedPhone,
    actionUrl: inboundResultActionUrl(url, callLog.id),
  });

  return twimlResponse(twiml);
}
