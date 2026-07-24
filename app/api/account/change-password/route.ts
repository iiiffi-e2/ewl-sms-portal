import { NextResponse } from "next/server";
import { compare, hash } from "bcryptjs";
import { requireSession } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = changePasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: authResult.session.user.id },
      select: { passwordHash: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const validCurrent = await compare(parsed.data.currentPassword, user.passwordHash);
    if (!validCurrent) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    if (parsed.data.newPassword === parsed.data.currentPassword) {
      return NextResponse.json(
        { error: "New password must be different from the current password." },
        { status: 400 },
      );
    }

    const passwordHash = await hash(parsed.data.newPassword, 12);
    await prisma.user.update({
      where: { id: authResult.session.user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
