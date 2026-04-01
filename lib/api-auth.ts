import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";

export async function requireSession() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
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
