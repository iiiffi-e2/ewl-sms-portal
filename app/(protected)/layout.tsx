import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { TopNav } from "@/components/caretext/TopNav";
import { AuthProvider } from "@/components/caretext/AuthProvider";

export default async function ProtectedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getAuthSession();
  if (!session?.user) {
    redirect("/login");
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
