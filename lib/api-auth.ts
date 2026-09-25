import { NextResponse } from "next/server";
import { readFreshAccount, rememberAccount } from "@/lib/account-freshness";
import { dbErrorResponse } from "@/lib/api-errors";
import { getAuthSession } from "@/lib/auth";
import { isTransientDbError } from "@/lib/db";
import { prisma } from "@/lib/prisma";

export async function requireSession() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // JWT sessions stay valid until expiry, so verify against the DB that the
  // account still exists and hasn't been disabled since the token was issued.
  // Overlapping polls from the same person share one lookup for a few seconds.
  const cached = readFreshAccount(session.user.id);
  let disabledAt = cached?.disabledAt ?? null;
  if (!cached) {
    let account: { disabledAt: Date | null } | null;
    try {
      account = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { disabledAt: true },
      });
    } catch (error) {
      // Routes call this outside their own try/catch; without this a DB timeout
      // escapes as a bare 500 instead of a retryable 503.
      if (isTransientDbError(error)) {
        return { error: dbErrorResponse(error) };
      }
      throw error;
    }
    if (!account) {
      return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    disabledAt = account.disabledAt;
    rememberAccount(session.user.id, disabledAt);
  }

  if (disabledAt) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { session };
}

export async function requireAdmin() {
  const result = await requireSession();
  if ("error" in result) {
    return result;
  }

  if (result.session.user.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return result;
}
