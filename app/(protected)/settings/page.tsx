import { redirect } from "next/navigation";
import { MessageExportPanel } from "@/components/caretext/MessageExportPanel";
import { UserManagementPanel } from "@/components/caretext/UserManagementPanel";
import { getAuthSession } from "@/lib/auth";

export default async function SettingsPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Admin tools and exports.</p>
      </div>
      <UserManagementPanel />
      <MessageExportPanel />
    </div>
  );
}
