import { NextResponse } from "next/server";
import { requireSession } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;

  try {
    const message = await prisma.message.findUnique({
      where: { id },
      select: {
        id: true,
        conversationId: true,
        attachment: {
          select: {
            bytes: true,
            contentType: true,
            sizeBytes: true,
          },
        },
      },
    });

    if (!message?.attachment) {
      return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    }

    const { attachment } = message;
    return new NextResponse(Buffer.from(attachment.bytes), {
      headers: {
        "Content-Type": attachment.contentType,
        "Content-Length": String(attachment.sizeBytes),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
