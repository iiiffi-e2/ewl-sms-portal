import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { isCommStackConfigured } from "@/lib/commstack";
import { startCommStackRealtime } from "@/lib/commstack-realtime";
import { syncCommStackInbox } from "@/lib/commstack-sync";

/**
 * Backfill inbound Notify DMs for recent Notify conversations (not just the
 * open thread). Safe to call periodically from the inbox poller.
 */
export async function POST() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!isCommStackConfigured()) {
    return NextResponse.json({ synced: 0, imported: 0, skipped: true });
  }

  // Keep the portal realtime socket warm in this process when possible.
  try {
    await startCommStackRealtime();
  } catch {
    // Sync still works via history even if realtime cannot connect.
  }

  try {
    const result = await syncCommStackInbox();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to sync Notify inbox.",
      },
      { status: 502 },
    );
  }
}
