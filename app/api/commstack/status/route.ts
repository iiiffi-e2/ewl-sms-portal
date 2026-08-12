import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import {
  getCommStackConfigDiagnostics,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
  isCommStackRealtimeEnabled,
  verifyCommStackAccess,
} from "@/lib/commstack";
import {
  getCommStackRealtimeError,
  getCommStackRealtimeStatus,
  isCommStackRealtimeConnected,
  startCommStackRealtime,
} from "@/lib/commstack-realtime";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const diagnostics = getCommStackConfigDiagnostics();

  if (!isCommStackConfigured()) {
    return NextResponse.json({
      configured: false,
      verified: false,
      realtimeMode: isCommStackRealtimeEnabled() ? "enabled" : "disabled",
      realtimeConnected: false,
      checks: diagnostics.checks,
      missing: diagnostics.missing,
      vercelEnv: process.env.VERCEL_ENV ?? null,
    });
  }

  const notifyContacts = await prisma.contact.findMany({
    where: {
      OR: [{ notifyClientId: { not: null } }, { notifyChannelId: { not: null } }],
      commStackAppId: { not: null },
    },
    select: {
      id: true,
      name: true,
      notifyClientId: true,
      notifyChannelId: true,
      commStackAppId: true,
      commStackAppName: true,
      commStackBaseUrl: true,
      commStackPortalUserId: true,
    },
    take: 50,
  });

  const communities = new Map<
    string,
    {
      baseUrl: string;
      appId: string;
      appName: string;
      portalUserId: string;
      contactCount: number;
    }
  >();

  for (const contact of notifyContacts) {
    if (!hasContactCommStackConfig(contact)) continue;
    try {
      const config = getContactCommStackConfig(contact);
      const key = `${config.baseUrl}|${config.appId}|${config.portalUserId}`;
      const existing = communities.get(key);
      if (existing) {
        existing.contactCount += 1;
      } else {
        communities.set(key, {
          baseUrl: config.baseUrl,
          appId: config.appId,
          appName: config.appName,
          portalUserId: config.portalUserId,
          contactCount: 1,
        });
      }
    } catch {
      // skip malformed
    }
  }

  const communityList = [...communities.values()];
  let verified = false;
  let verifyError: string | null = null;

  if (communityList.length > 0) {
    try {
      const sample = notifyContacts.find((c) => hasContactCommStackConfig(c));
      if (sample) {
        await verifyCommStackAccess(getContactCommStackConfig(sample));
        verified = true;
      }
    } catch (error) {
      verifyError = error instanceof Error ? error.message : "CommStack verification failed.";
    }
  }

  const realtimeEnabled = isCommStackRealtimeEnabled();
  let realtimeError: string | null = null;

  if (realtimeEnabled) {
    try {
      await startCommStackRealtime();
    } catch (error) {
      realtimeError = error instanceof Error ? error.message : String(error);
    }
  }

  return NextResponse.json({
    configured: true,
    verified,
    verifyError,
    realtimeMode: realtimeEnabled ? "enabled" : "disabled",
    realtimeConnected: realtimeEnabled ? isCommStackRealtimeConnected() : false,
    realtimeError: realtimeEnabled ? (realtimeError ?? getCommStackRealtimeError()) : null,
    realtime: realtimeEnabled
      ? getCommStackRealtimeStatus()
      : { connections: [] },
    env: process.env.COMM_STACK_ENV?.trim() ?? null,
    communities: communityList,
    notifyContactCount: notifyContacts.length,
    checks: diagnostics.checks,
    missing: diagnostics.missing,
  });
}
