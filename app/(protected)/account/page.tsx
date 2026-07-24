import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/caretext/ChangePasswordForm";
import { getAuthSession } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="mt-1 text-sm text-muted">Manage your own account.</p>
      </div>
      <div className="rounded-xl border border-border bg-white p-4">
        <h2 className="text-lg font-semibold">Change password</h2>
        <p className="mt-1 text-sm text-muted">Update the password for your own account.</p>
        <div className="mt-4 max-w-md">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
