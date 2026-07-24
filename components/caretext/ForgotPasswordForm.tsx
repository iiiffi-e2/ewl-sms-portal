"use client";

import { FormEvent, useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);

    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      // Intentionally ignore network errors here: we always show the same
      // confirmation so the form can't be used to probe for valid accounts.
    } finally {
      setSubmitted(true);
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          If an account exists for <span className="font-medium">{email}</span>, a password reset
          link has been sent. The link expires in one hour.
        </p>
        <a href="/login" className="block text-indigo-600 hover:underline">
          Back to sign in
        </a>
      </div>
    );
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
          autoComplete="email"
          required
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Sending..." : "Send reset link"}
      </button>
      <p className="text-center text-sm">
        <a href="/login" className="text-indigo-600 hover:underline">
          Back to sign in
        </a>
      </p>
    </form>
  );
}
