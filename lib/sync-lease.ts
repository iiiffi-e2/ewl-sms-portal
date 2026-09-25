import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { INBOX_SYNC_COOLDOWN_MS } from "@/lib/commstack-sync-gate";
import { isTransientDbError } from "@/lib/db";
import { prisma } from "@/lib/prisma";

export const INBOX_SYNC_LEASE_ID = "commstack-inbox";
/** If the holder is killed mid-sync, another instance may take over after this. */
export const INBOX_SYNC_LEASE_HOLD_MS = 60_000;

export type InboxSyncLease = {
  token: string;
};

/**
 * Atomically claim the global inbox sync. Returns null when another instance
 * already holds it, so open inboxes do not each pull CommStack history.
 * Also returns null when the database is timing out or unreachable: granting
 * the lease then would send every instance into a full sync at once.
 * If the table is not migrated yet, returns a token anyway and the
 * per-instance gate remains the only guard.
 */
export async function tryAcquireInboxSyncLease(now = new Date()): Promise<InboxSyncLease | null> {
  const token = randomUUID();
  const holdUntil = new Date(now.getTime() + INBOX_SYNC_LEASE_HOLD_MS);
  try {
    const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "SyncLease" ("id", "lockedUntil", "ownerToken", "createdAt", "updatedAt")
      VALUES (${INBOX_SYNC_LEASE_ID}, ${holdUntil}, ${token}, ${now}, ${now})
      ON CONFLICT ("id") DO UPDATE
      SET "lockedUntil" = EXCLUDED."lockedUntil",
          "ownerToken" = EXCLUDED."ownerToken",
          "updatedAt" = EXCLUDED."updatedAt"
      WHERE "SyncLease"."lockedUntil" < ${now}
      RETURNING "id"
    `);
    return rows.length > 0 ? { token } : null;
  } catch (error) {
    if (isTransientDbError(error)) {
      console.error("[sync] inbox lease query failed; skipping this sync", error);
      return null;
    }
    console.error("[sync] inbox lease unavailable; using per-instance gate only", error);
    return { token };
  }
}

/** After a successful sync, block the next global run for the cooldown. */
export async function finishInboxSyncLease(lease: InboxSyncLease, now = new Date()): Promise<void> {
  const cooldownUntil = new Date(now.getTime() + INBOX_SYNC_COOLDOWN_MS);
  try {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "SyncLease"
      SET "lockedUntil" = ${cooldownUntil},
          "ownerToken" = NULL,
          "updatedAt" = ${now}
      WHERE "id" = ${INBOX_SYNC_LEASE_ID}
        AND "ownerToken" = ${lease.token}
    `);
  } catch (error) {
    console.error("[sync] inbox lease release failed", error);
  }
}
