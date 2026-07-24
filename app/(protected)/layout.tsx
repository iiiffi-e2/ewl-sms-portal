import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { TopNav } from "@/components/caretext/TopNav";
import { AuthProvider } from "@/components/caretext/AuthProvider";
import { prisma } from "@/lib/prisma";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  // Checked against the DB (not the JWT) so account state changes take effect
  // immediately on the next navigation without needing to re-issue the token.
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true, disabledAt: true },
  });
  if (!account || account.disabledAt) {
    redirect("/account-disabled");
  }
  if (account.mustChangePassword) {
    redirect("/change-password");
  }

  return (
    <AuthProvider>
      <main className="mx-auto w-full max-w-[1600px] p-4">
        <TopNav isAdmin={session.user.role === "admin"} />
        {children}
      </main>
    </AuthProvider>
  );
}
