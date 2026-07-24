"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "nurse";
  phoneNumber: string | null;
  disabledAt: string | null;
  createdAt: string;
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "nurse" as "admin" | "nurse",
  phoneNumber: "",
};

export function UserManagementPanel() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id;
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [tempPasswords, setTempPasswords] = useState<Record<string, string>>({});
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const response = await fetch("/api/users");
    if (!response.ok) {
      setError("Failed to load users.");
      setIsLoading(false);
      return;
    }

    const data = (await response.json()) as { users: ManagedUser[] };
    setUsers(data.users);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = (await response.json()) as {
        error?: string | { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
      };

      if (!response.ok) {
        if (typeof data.error === "string") {
          setError(data.error);
        } else {
          const fieldError = data.error?.fieldErrors
            ? Object.values(data.error.fieldErrors).flat()[0]
            : undefined;
          setError(fieldError ?? data.error?.formErrors?.[0] ?? "Failed to create user.");
        }
        return;
      }

      setSuccess(`Created login for ${form.email}.`);
      setForm(emptyForm);
      await loadUsers();
    } catch {
      setError("Failed to create user.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetPassword(user: ManagedUser) {
    if (
      !window.confirm(
        `Reset the password for ${user.email}? They will be required to set a new one at next sign-in.`,
      )
    ) {
      return;
    }

    setError(null);
    setResettingId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const data = (await response.json()) as { temporaryPassword?: string; error?: string };

      if (!response.ok || !data.temporaryPassword) {
        setError(typeof data.error === "string" ? data.error : "Failed to reset password.");
        return;
      }

      setTempPasswords((prev) => ({ ...prev, [user.id]: data.temporaryPassword as string }));
    } catch {
      setError("Failed to reset password.");
    } finally {
      setResettingId(null);
    }
  }

  async function handleToggleDisabled(user: ManagedUser) {
    const willDisable = !user.disabledAt;
    if (
      willDisable &&
      !window.confirm(`Disable ${user.email}? They will be signed out and unable to log in.`)
    ) {
      return;
    }

    setError(null);
    setTogglingId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: willDisable }),
      });

      const data = (await response.json()) as { user?: ManagedUser; error?: string };

      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed to update user.");
        return;
      }

      await loadUsers();
    } catch {
      setError("Failed to update user.");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <h2 className="text-lg font-semibold">Users</h2>
      <p className="mt-1 text-sm text-muted">
        Create logins for staff. Each user signs in with their own email and password.
      </p>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Name</span>
          <input
            className="rounded-lg border border-border px-3 py-2"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Email</span>
          <input
            type="email"
            className="rounded-lg border border-border px-3 py-2"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Temporary password</span>
          <input
            type="password"
            className="rounded-lg border border-border px-3 py-2"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            minLength={8}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium">Role</span>
          <select
            className="rounded-lg border border-border px-3 py-2"
            value={form.role}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, role: event.target.value as "admin" | "nurse" }))
            }
          >
            <option value="nurse">Nurse</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Phone number (optional)</span>
          <input
            className="rounded-lg border border-border px-3 py-2"
            value={form.phoneNumber}
            onChange={(event) => setForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
          />
        </label>

        {error ? <p className="text-sm text-red-600 sm:col-span-2">{error}</p> : null}
        {success ? <p className="text-sm text-green-600 sm:col-span-2">{success}</p> : null}

        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create user"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">Existing users</h3>
        {isLoading ? (
          <p className="mt-2 text-sm text-muted">Loading...</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {users.map((user) => (
              <li key={user.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {user.name}
                      {user.disabledAt ? (
                        <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                          Disabled
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-muted">{user.email}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize">
                      {user.role}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-border px-2 py-1 text-xs font-medium disabled:opacity-60"
                      onClick={() => void handleResetPassword(user)}
                      disabled={resettingId === user.id}
                    >
                      {resettingId === user.id ? "Resetting..." : "Reset password"}
                    </button>
                    {user.id !== currentUserId ? (
                      <button
                        type="button"
                        className={`rounded-lg border px-2 py-1 text-xs font-medium disabled:opacity-60 ${
                          user.disabledAt
                            ? "border-border"
                            : "border-rose-200 text-rose-700 hover:bg-rose-50"
                        }`}
                        onClick={() => void handleToggleDisabled(user)}
                        disabled={togglingId === user.id}
                      >
                        {togglingId === user.id
                          ? "Saving..."
                          : user.disabledAt
                            ? "Enable"
                            : "Disable"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {tempPasswords[user.id] ? (
                  <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Temporary password:{" "}
                    <span className="font-mono font-semibold">{tempPasswords[user.id]}</span>. Share
                    it securely; they&apos;ll be asked to change it at next sign-in.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
