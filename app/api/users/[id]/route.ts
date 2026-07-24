import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { updateUserSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;

  const payload = await request.json().catch(() => ({}));
  const parsed = updateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Guard against an admin locking themselves out.
  if (parsed.data.disabled && id === authResult.session.user.id) {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id },
      data: {
        disabledAt: parsed.data.disabled ? new Date() : null,
        // Kill any outstanding password reset links when disabling.
        ...(parsed.data.disabled
          ? {
              passwordResetTokens: {
                updateMany: { where: { usedAt: null }, data: { usedAt: new Date() } },
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumber: true,
        disabledAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return dbErrorResponse(error);
  }
}
