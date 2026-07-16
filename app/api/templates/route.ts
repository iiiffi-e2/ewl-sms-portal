import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/api-auth";
import { dbErrorResponse } from "@/lib/api-errors";
import { cacheFor, withDbRetry } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { createTemplateSchema } from "@/lib/validators";

export async function GET() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const isAdmin = authResult.session.user.role === "admin";

  try {
    const templates = await withDbRetry(() =>
      prisma.template.findMany({
        where: isAdmin ? undefined : { active: true },
        orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
        // Templates change rarely and every tab loads them on mount, so cache the
        // high-volume nurse read to collapse the open-30-tabs burst. Admins are
        // the ones editing, so keep their view uncached for immediate feedback.
        cacheStrategy: isAdmin ? undefined : cacheFor({ ttl: 60, swr: 300 }),
      }),
    );

    return NextResponse.json({ templates });
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
  const parsed = createTemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const template = await prisma.template.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category ?? null,
      active: parsed.data.active ?? true,
    },
  });

  return NextResponse.json({ template }, { status: 201 });
}
