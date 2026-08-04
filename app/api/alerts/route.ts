import { AlertStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam && ["open", "cleared", "unmatched"].includes(statusParam)
      ? (statusParam as AlertStatus)
      : undefined;

  const alerts = await prisma.alert.findMany({
    where: status ? { status } : undefined,
    orderBy: { eventDateTime: "desc" },
    take: 100,
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          phone: true,
          notifyClientId: true,
        },
      },
      conversation: {
        select: { id: true },
      },
    },
  });

  return NextResponse.json({ alerts });
}
