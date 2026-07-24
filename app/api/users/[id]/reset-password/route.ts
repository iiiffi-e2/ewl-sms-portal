import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { generateTemporaryPassword } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { adminResetPasswordSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json().catch(() => ({}));
  const parsed = adminResetPasswordSchema.safeParse(payload ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const temporaryPassword = parsed.data.password ?? generateTemporaryPassword();
  const passwordHash = await hash(temporaryPassword, 12);

  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true },
      }),
      // Invalidate any outstanding email reset links for this user.
      prisma.passwordResetToken.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ temporaryPassword });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    return dbErrorResponse(error);
  }
}
