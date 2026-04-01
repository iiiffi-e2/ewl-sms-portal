import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createTemplateSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const payload = await request.json();
  const parsed = createTemplateSchema.partial().safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const template = await prisma.template.update({
    where: { id },
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      category: parsed.data.category,
      active: parsed.data.active,
    },
  });

  return NextResponse.json({ template });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireAdmin();
  if ("error" in authResult) {
    return authResult.error;
  }

  const { id } = await params;
  await prisma.template.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
