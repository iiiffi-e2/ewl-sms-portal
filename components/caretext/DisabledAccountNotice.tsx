"use client";

import { useEffect } from "react";
import { signOut } from "next-auth/react";

export function DisabledAccountNotice() {
  useEffect(() => {
    // Clear the stale JWT cookie so the disabled user can't navigate back into
    // the app. authorize() also blocks any fresh sign-in attempt.
    void signOut({ redirect: false });
  }, []);

  return (
    <button
      type="button"
      className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Return to sign in
    </button>
  );
}
