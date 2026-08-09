import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { syncCommStackConversation } from "@/lib/commstack-sync";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { contact: true },
  });

  if (!conversation || conversation.archivedAt) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  if (!conversation.contact?.notifyClientId) {
    return NextResponse.json({ imported: 0, skipped: true });
  }

  try {
    const imported = await syncCommStackConversation(id);
    return NextResponse.json({ imported });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync CommStack messages." },
      { status: 502 },
    );
  }
}
