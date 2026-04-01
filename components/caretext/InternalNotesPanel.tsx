"use client";

import { useState } from "react";
import { formatMessageTime } from "@/lib/format";

type Note = {
  id: string;
  body: string;
  createdAt: string;
  user: { name: string | null };
};

type InternalNotesPanelProps = {
  conversationId?: string;
  notes: Note[];
  onCreated: (newNote: Note) => void;
};

export function InternalNotesPanel({ conversationId, notes, onCreated }: InternalNotesPanelProps) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-white p-4">
      <p className="font-semibold">Internal Notes</p>
      <div className="max-h-44 space-y-2 overflow-y-auto">
        {notes.map((note) => (
          <div key={note.id} className="rounded-lg border border-border bg-slate-50 p-2">
            <p className="text-sm">{note.body}</p>
            <p className="mt-1 text-[11px] text-muted">
              {note.user?.name ?? "Unknown"} · {formatMessageTime(note.createdAt)}
            </p>
          </div>
        ))}
        {!notes.length && <p className="text-sm text-muted">No notes yet.</p>}
      </div>
      {conversationId ? (
        <>
          <textarea
            className="h-20 w-full rounded-lg border border-border px-3 py-2 text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add internal note..."
          />
          <button
            disabled={saving}
            className="rounded-lg border border-border px-3 py-2 text-sm font-semibold"
            onClick={async () => {
              if (!body.trim()) return;
              setSaving(true);
              try {
                const response = await fetch(`/api/conversations/${conversationId}/notes`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ body }),
                });
                if (!response.ok) {
                  throw new Error("Failed to save note.");
                }
                const data = await response.json();
                onCreated(data.note);
                setBody("");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving..." : "Add Note"}
          </button>
        </>
      ) : null}
    </div>
  );
}
