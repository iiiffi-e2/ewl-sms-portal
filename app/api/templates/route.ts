import { NextResponse } from "next/server";
import { requireAdmin, requireSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTemplateSchema } from "@/lib/validators";

export async function GET() {
  const authResult = await requireSession();
  if ("error" in authResult) {
    return authResult.error;
  }

  const templates = await prisma.template.findMany({
    where: authResult.session.user.role === "admin" ? undefined : { active: true },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
  });

  return NextResponse.json({ templates });
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
