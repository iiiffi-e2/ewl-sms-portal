import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { LoginForm } from "@/components/caretext/LoginForm";

export default async function LoginPage() {
  const session = await getAuthSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">CareText Login</h1>
        <p className="mb-4 mt-1 text-sm text-muted">Sign in to access the nurse messaging dashboard.</p>
        <LoginForm />
      </div>
    </main>
  );
}
