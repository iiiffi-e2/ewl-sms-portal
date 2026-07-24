"use client";

import { FormEvent, useState } from "react";

type ChangePasswordFormProps = {
  forced?: boolean;
};

export function ChangePasswordForm({ forced = false }: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
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
          setError(fieldError ?? "Could not update password.");
        }
        setLoading(false);
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setError("Could not update password. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label className="mb-1 block text-sm font-medium">
          {forced ? "Temporary password" : "Current password"}
        </label>
        <input
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
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
        {loading ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}
