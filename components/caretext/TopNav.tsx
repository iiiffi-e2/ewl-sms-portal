"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

const navLinkClass = "block rounded-lg px-3 py-2 text-sm text-muted hover:bg-slate-50 hover:text-foreground lg:inline lg:rounded-none lg:px-0 lg:py-0 lg:hover:bg-transparent";

export function TopNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    }

    function onPointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) {
        return;
      }
      setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [menuOpen]);

  const links = (
    <>
      <Link href="/dashboard" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Dashboard
      </Link>
      <Link href="/contacts" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Contacts
      </Link>
      {isAdmin ? (
        <>
          <Link href="/templates" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Templates
          </Link>
          <Link href="/settings" className={navLinkClass} onClick={() => setMenuOpen(false)}>
            Settings
          </Link>
        </>
      ) : null}
      <Link href="/change-password" className={navLinkClass} onClick={() => setMenuOpen(false)}>
        Change password
      </Link>
    </>
  );

  return (
    <header className="mb-4 rounded-xl border border-border bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/dashboard" className="shrink-0" onClick={() => setMenuOpen(false)}>
            <Image
              src="/caretext-logo.png"
              alt="CareText"
              width={2200}
              height={500}
              className="h-auto w-[150px] sm:w-[195px]"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-3 text-sm text-muted lg:flex">{links}</nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden rounded-lg border border-border px-3 py-1.5 text-sm lg:inline-flex"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-sm lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <span aria-hidden="true" className="text-base leading-none">
                ✕
              </span>
            ) : (
              <span aria-hidden="true" className="flex flex-col gap-1">
                <span className="block h-0.5 w-4 bg-foreground" />
                <span className="block h-0.5 w-4 bg-foreground" />
                <span className="block h-0.5 w-4 bg-foreground" />
              </span>
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          ref={panelRef}
          id={menuId}
          className="mt-3 border-t border-border pt-3 lg:hidden"
        >
          <nav className="flex flex-col gap-1">{links}</nav>
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-left text-sm"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </header>
  );
}
