import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  processOutboundAlertSend,
  resolveCommStackSdkToken,
} from "@/lib/notify-outbound-alert";
import { sendAlertSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = sendAlertSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const sdkToken = resolveCommStackSdkToken();
  if (!sdkToken) {
    return NextResponse.json(
      {
        error:
          "CommStack SDK token is not configured. Set COMM_STACK_SDK_TOKEN (or COMM_STACK_SDK_TOKEN_DEV / COMM_STACK_SDK_TOKEN_PRODUCTION).",
      },
      { status: 500 },
    );
  }

  const { conversationId, messageId, room, note } = parsed.data;
  const result = await processOutboundAlertSend({
    conversationId,
    messageId,
    room,
    note,
    sdkToken,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ alert: result.alert });
}
