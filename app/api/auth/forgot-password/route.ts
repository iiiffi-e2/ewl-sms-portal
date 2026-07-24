import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email";
import { generateResetToken, RESET_TOKEN_TTL_MS } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validators";

function buildResetUrl(token: string): string {
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const url = new URL("/reset-password", base);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const parsed = forgotPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Always respond 200 with the same body regardless of whether the email
  // exists, so this endpoint can't be used to enumerate registered accounts.
  const genericResponse = NextResponse.json({ ok: true });

  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, email: true, name: true },
    });

    if (!user) {
      return genericResponse;
    }

    const { token, tokenHash } = generateResetToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.$transaction([
      // Invalidate previous outstanding links so only the newest one works.
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      }),
    ]);

    const resetUrl = buildResetUrl(token);
    await sendEmail({
      to: user.email,
      subject: "Reset your CareText password",
      text:
        `Hi ${user.name},\n\n` +
        `We received a request to reset your CareText password. ` +
        `Use the link below within the next hour to choose a new password:\n\n` +
        `${resetUrl}\n\n` +
        `If you didn't request this, you can safely ignore this email.`,
      html:
        `<p>Hi ${user.name},</p>` +
        `<p>We received a request to reset your CareText password. ` +
        `Use the link below within the next hour to choose a new password:</p>` +
        `<p><a href="${resetUrl}">Reset your password</a></p>` +
        `<p>If you didn't request this, you can safely ignore this email.</p>`,
    });

    return genericResponse;
  } catch (error) {
    // Log server-side but still return the generic response to avoid leaking
    // whether the address exists or that an internal error occurred.
    console.error("forgot-password error:", error);
    return genericResponse;
  }
}
