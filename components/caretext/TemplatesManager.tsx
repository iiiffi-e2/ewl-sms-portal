"use client";

import { useCallback, useEffect, useState } from "react";

type Template = {
  id: string;
  title: string;
  body: string;
  category: string | null;
  active: boolean;
};

export function TemplatesManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");

  const loadTemplates = useCallback(async () => {
    const response = await fetch("/api/templates");
    const data = await response.json();
    setTemplates(data.templates);
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-white p-4">
        <h2 className="text-lg font-semibold">Create Template</h2>
        <div className="mt-3 grid gap-2">
          <input
            className="rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <input
            className="rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
          <textarea
            className="h-28 rounded-lg border border-border px-3 py-2 text-sm"
            placeholder="Body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          <button
            className="justify-self-start rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              const response = await fetch("/api/templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, body, category }),
              });
              if (response.ok) {
                setTitle("");
                setBody("");
                setCategory("");
                await loadTemplates();
              }
            }}
          >
            Save Template
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Template Library</h2>
        <div className="space-y-2">
          {templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{template.title}</p>
                  <p className="text-xs text-muted">{template.category || "General"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                    onClick={async () => {
                      await fetch(`/api/templates/${template.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ active: !template.active }),
                      });
                      await loadTemplates();
                    }}
                  >
                    {template.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-rose-600"
                    onClick={async () => {
                      await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
                      await loadTemplates();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{template.body}</p>
            </div>
          ))}
          {!templates.length && <p className="text-sm text-muted">No templates available.</p>}
        </div>
      </div>
    </div>
  );
}
