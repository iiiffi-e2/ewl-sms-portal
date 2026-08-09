import type { NotifyAlertPayload } from "@/lib/notify-alert-format";

export type { NotifyAlertPayload };

export function parseNotifyAlertPayload(raw: unknown): NotifyAlertPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.id !== "string" || !body.id.trim()) return null;
  if (body.type !== "Alert" && body.type !== "Clear") return null;
  if (typeof body.eventDateTime !== "string" || !body.eventDateTime.trim()) return null;
  return body as NotifyAlertPayload;
}

export function candidateNotifyClientIds(payload: NotifyAlertPayload): string[] {
  const ids = new Set<string>();
  if (payload.id?.trim()) ids.add(payload.id.trim());
  return [...ids];
}
