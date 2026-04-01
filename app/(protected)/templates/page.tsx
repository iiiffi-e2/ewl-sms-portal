import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { TemplatesManager } from "@/components/caretext/TemplatesManager";

export default async function TemplatesPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return <TemplatesManager />;
}
