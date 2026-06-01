import Image from "next/image";
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
        <div className="mb-2 flex justify-center">
          <Image
            src="/caretext-logo.png"
            alt="CareText"
            width={1024}
            height={426}
            className="h-12 w-auto"
            priority
          />
        </div>
        <p className="mb-4 text-center text-sm text-muted">
          Sign in to access the nurse messaging dashboard.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
