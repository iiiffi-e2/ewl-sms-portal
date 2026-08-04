import { NextResponse } from "next/server";
import { parseNotifyAlertPayload, processNotifyAlertEvent } from "@/lib/notify-alerts";

function authorizeNotifyWebhook(request: Request): boolean {
  const secret = process.env.NOTIFY_ALERT_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const header = request.headers.get("x-notify-webhook-secret");
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get("token");
  return header === secret || queryToken === secret;
}

async function handleAlertRequest(request: Request, facilityCode: string) {
  if (!authorizeNotifyWebhook(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = parseNotifyAlertPayload(raw);
  if (!payload) {
    return NextResponse.json({ error: "Invalid Notify alert payload." }, { status: 400 });
  }

  try {
    const alert = await processNotifyAlertEvent({
      payload,
      facilityCode,
    });
    return NextResponse.json({ alert });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process alert." },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ facilityCode: string }> },
) {
  const { facilityCode } = await params;
  return handleAlertRequest(request, facilityCode);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ facilityCode: string }> },
) {
  const { facilityCode } = await params;
  return handleAlertRequest(request, facilityCode);
}
