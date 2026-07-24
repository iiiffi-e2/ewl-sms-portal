"use client";

import { FormEvent, useState } from "react";

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = (await response.json()) as {
        error?: string | { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
      };

      if (!response.ok) {
        if (typeof data.error === "string") {
          setError(data.error);
        } else {
          const fieldError = data.error?.fieldErrors
            ? Object.values(data.error.fieldErrors).flat()[0]
            : undefined;
          setError(fieldError ?? "Could not reset password.");
        }
        setLoading(false);
        return;
      }

      setDone(true);
    } catch {
      setError("Could not reset password. Please try again.");
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-rose-600">This reset link is missing its token. Request a new one.</p>
        <a href="/forgot-password" className="block text-indigo-600 hover:underline">
          Request a new link
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-muted">Your password has been reset. You can now sign in.</p>
        <a href="/login" className="block text-indigo-600 hover:underline">
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label className="mb-1 block text-sm font-medium">New password</label>
        <input
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">Confirm new password</label>
        <input
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      <button
        type="submit"
        className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Saving..." : "Reset password"}
      </button>
    </form>
  );
}
