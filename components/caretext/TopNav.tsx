"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3">
      <div className="flex min-w-0 items-center gap-4">
        <p className="text-lg font-semibold">CareText</p>
        <nav className="flex items-center gap-3 text-sm text-muted">
          <Link href="/dashboard" className="hover:text-foreground">
            Dashboard
          </Link>
          <Link href="/contacts" className="hover:text-foreground">
            Contacts
          </Link>
          {isAdmin ? (
            <Link href="/templates" className="hover:text-foreground">
              Templates
            </Link>
          ) : null}
        </nav>
      </div>
      <button
        className="ml-auto rounded-lg border border-border px-3 py-1.5 text-sm sm:ml-0"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Sign out
      </button>
    </header>
  );
}
