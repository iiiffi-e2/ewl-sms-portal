import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { withDbRetry } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { createUserSchema } from "@/lib/validators";

export async function GET() {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  try {
    const users = await withDbRetry(() =>
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phoneNumber: true,
          disabledAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: "asc" }],
      }),
    );

    return NextResponse.json({ users });
  } catch (error) {
    return dbErrorResponse(error);
  }
}

export async function POST(request: Request) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createUserSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const passwordHash = await hash(parsed.data.password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        passwordHash,
        role: parsed.data.role,
        phoneNumber: parsed.data.phoneNumber ?? null,
        // The admin sets a temporary password; require the user to replace it
        // on first sign-in.
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phoneNumber: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "A user with that email already exists." },
        { status: 409 },
      );
    }

    return dbErrorResponse(error);
  }
}
