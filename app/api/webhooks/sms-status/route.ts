import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapTwilioStatusToMessageStatus } from "@/lib/status";

export async function POST(request: Request) {
  const payload = await request.formData();

  const messageSid = payload.get("MessageSid")?.toString();
  const twilioStatus = payload.get("MessageStatus")?.toString();
  const errorMessage = payload.get("ErrorMessage")?.toString() ?? null;

  if (!messageSid || !twilioStatus) {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const message = await prisma.message.findUnique({
    where: { twilioSid: messageSid },
    select: { id: true },
  });

  if (!message) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  await prisma.message.update({
    where: { id: message.id },
    data: {
      status: mapTwilioStatusToMessageStatus(twilioStatus),
      errorMessage,
    },
  });

  return NextResponse.json({ ok: true });
}
