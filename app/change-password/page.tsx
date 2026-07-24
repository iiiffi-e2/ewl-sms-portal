import Image from "next/image";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/caretext/ChangePasswordForm";
import { getAuthSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ChangePasswordPage() {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  });

  const forced = user?.mustChangePassword ?? false;

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
        <h1 className="text-center text-lg font-semibold">
          {forced ? "Set a new password" : "Change password"}
        </h1>
        <p className="mb-4 mt-1 text-center text-sm text-muted">
          {forced
            ? "For security, please choose your own password before continuing."
            : "Choose a new password for your account."}
        </p>
        <ChangePasswordForm forced={forced} />
        {!forced ? (
          <p className="mt-4 text-center text-sm">
            <a href="/dashboard" className="text-indigo-600 hover:underline">
              Back to dashboard
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
