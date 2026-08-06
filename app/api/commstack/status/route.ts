import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  isCommStackConfigured,
  verifyCommStackAccess,
} from "@/lib/commstack";
import {
  getCommStackRealtimeError,
  isCommStackRealtimeConnected,
  startCommStackRealtime,
} from "@/lib/commstack-realtime";

export async function GET() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!isCommStackConfigured()) {
    return NextResponse.json({
      configured: false,
      verified: false,
      realtimeConnected: false,
    });
  }

  try {
    await verifyCommStackAccess();
  } catch (error) {
    return NextResponse.json(
      {
        configured: true,
        verified: false,
        realtimeConnected: isCommStackRealtimeConnected(),
        error: error instanceof Error ? error.message : "CommStack verification failed.",
      },
      { status: 502 },
    );
  }

  let realtimeError: string | null = null;
  try {
    // Ensure realtime is up in this Node process (instrumentation alone is not
    // always enough under next dev / multiple workers).
    await startCommStackRealtime();
  } catch (error) {
    realtimeError = error instanceof Error ? error.message : String(error);
  }

  return NextResponse.json({
    configured: true,
    verified: true,
    realtimeConnected: isCommStackRealtimeConnected(),
    realtimeError: realtimeError ?? getCommStackRealtimeError(),
    baseUrl: process.env.COMM_STACK_BASE_URL?.trim() ?? null,
    env: process.env.COMM_STACK_ENV?.trim() ?? null,
    appId: process.env.COMM_STACK_APP_ID?.trim() ?? null,
  });
}
