"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <header className="mb-4 flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3">
      <div className="flex items-center gap-4">
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
        className="rounded-lg border border-border px-3 py-1.5 text-sm"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        Sign out
      </button>
    </header>
  );
}
