import Image from "next/image";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { LoginForm } from "@/components/caretext/LoginForm";
import { EMBED_INBOX_PATH } from "@/lib/embed";

type LoginPageProps = {
  searchParams: Promise<{ callbackUrl?: string }>;
};

export default async function EmbedLoginPage({ searchParams }: LoginPageProps) {
  const session = await getAuthSession();
  const { callbackUrl } = await searchParams;
  const safeCallbackUrl =
    callbackUrl && callbackUrl.startsWith("/embed/") ? callbackUrl : EMBED_INBOX_PATH;

  if (session?.user) {
    redirect(safeCallbackUrl);
  }

  return (
    <main className="flex h-full items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-border bg-white p-6 shadow-sm">
        <div className="mb-2 flex justify-center">
          <Image
            src="/caretext-logo.png"
            alt="CareText"
            width={1024}
            height={232}
            className="h-10 w-auto"
            priority
          />
        </div>
        <p className="mb-4 text-center text-sm text-muted">Sign in to open the CareText inbox.</p>
        <LoginForm callbackUrl={safeCallbackUrl} />
      </div>
    </main>
  );
}
