import Image from "next/image";
import { redirect } from "next/navigation";
import { ForgotPasswordForm } from "@/components/caretext/ForgotPasswordForm";
import { getAuthSession } from "@/lib/auth";

export default async function ForgotPasswordPage() {
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
            height={232}
            className="h-12 w-auto"
            priority
          />
        </div>
        <h1 className="text-center text-lg font-semibold">Forgot your password?</h1>
        <p className="mb-4 mt-1 text-center text-sm text-muted">
          Enter your email and we&apos;ll send you a link to reset it.
        </p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
