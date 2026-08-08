import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { ensureConversationForContact } from "@/lib/contact-conversation";
import { isSoftDeleted } from "@/lib/contact-soft-delete";
import { prisma } from "@/lib/prisma";

/**
 * Find or create an active direct conversation for a contact, then return its id
 * so the UI can open the inbox thread.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    select: { id: true, deletedAt: true },
  });

  if (!contact || isSoftDeleted(contact)) {
    return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  }

  const conversation = await ensureConversationForContact(contact.id, {
    assignedToId: authResult.session.user.id,
  });

  return NextResponse.json({ conversationId: conversation.id });
}
