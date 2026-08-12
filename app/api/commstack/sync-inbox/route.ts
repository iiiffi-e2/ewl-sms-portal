import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { isCommStackConfigured } from "@/lib/commstack";
import { syncCommStackInbox } from "@/lib/commstack-sync";

/**
 * Backfills inbound Notify DMs for recent conversations. Safe to call
 * periodically from the inbox poller; history sync is the primary inbound path.
 */
export async function POST() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  if (!isCommStackConfigured()) {
    return NextResponse.json({ synced: 0, imported: 0, skipped: true });
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
