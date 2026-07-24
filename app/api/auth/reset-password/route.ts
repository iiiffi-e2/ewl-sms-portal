import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { dbErrorResponse } from "@/lib/api-errors";
import { hashResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { resetPasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parsed = resetPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const tokenHash = hashResetToken(parsed.data.token);

  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, usedAt: true, expiresAt: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 },
      );
    }

    const passwordHash = await hash(parsed.data.newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
