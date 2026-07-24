import Image from "next/image";
import { DisabledAccountNotice } from "@/components/caretext/DisabledAccountNotice";

export default function AccountDisabledPage() {
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
        <h1 className="text-center text-lg font-semibold">Account disabled</h1>
        <p className="mb-4 mt-1 text-center text-sm text-muted">
          Your account has been disabled. Please contact an administrator if you believe this is a
          mistake.
        </p>
        <DisabledAccountNotice />
      </div>
    </main>
  );
}
