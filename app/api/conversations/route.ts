import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/api-auth";

export async function GET(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  const conversations = await prisma.conversation.findMany({
    where: {
      archivedAt: null,
      ...(query
        ? {
            OR: [
              { contact: { name: { contains: query, mode: "insensitive" } } },
              { contact: { phone: { contains: query, mode: "insensitive" } } },
              { contact: { facility: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: {
      contact: true,
      assignedTo: {
        select: { id: true, name: true, email: true },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          body: true,
          direction: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({ conversations });
}
