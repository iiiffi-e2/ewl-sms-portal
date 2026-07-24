"use client";

import { FormEvent, useState } from "react";
import { getSession, signIn } from "next-auth/react";

type LoginFormProps = {
  callbackUrl?: string;
};

async function requestCrossSiteStorageAccess() {
  if (typeof window === "undefined" || window.self === window.top) {
    return;
  }

  if (!document.requestStorageAccess) {
    return;
  }

  try {
    await document.requestStorageAccess();
  } catch {
    // Browser may still accept SameSite=None cookies without storage access.
  }
}

export function LoginForm({ callbackUrl = "/dashboard" }: LoginFormProps) {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    await requestCrossSiteStorageAccess();

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl,
    });

    if (!result?.ok) {
      setLoading(false);
      setError(result?.error === "CredentialsSignin" ? "Invalid credentials." : "Sign in failed. Please try again.");
      return;
    }

    const session = await getSession();
    if (!session) {
      setLoading(false);
      setError(
        "Login succeeded but this browser did not keep your session. If the portal is embedded on another site, set NEXTAUTH_EMBED_CROSS_ORIGIN=true on HTTPS and redeploy.",
      );
      return;
    }

    window.location.href = callbackUrl;
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label className="mb-1 block text-sm font-medium">Email</label>
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          type="email"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Password</label>
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          type="password"
          required
        />
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
        disabled={loading}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
      <p className="text-center text-sm">
        <a href="/forgot-password" className="text-indigo-600 hover:underline">
          Forgot your password?
        </a>
      </p>
    </form>
  );
}
