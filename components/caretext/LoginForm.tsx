"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm() {
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });

    setLoading(false);
    if (result?.error) {
      setError("Invalid credentials.");
      return;
    }

    window.location.href = "/dashboard";
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
    </form>
  );
}
