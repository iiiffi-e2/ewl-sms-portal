import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireSession() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // JWT sessions stay valid until expiry, so verify against the DB that the
  // account still exists and hasn't been disabled since the token was issued.
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { disabledAt: true },
  });
  if (!account || account.disabledAt) {
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
