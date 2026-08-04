"use client";

import { useCallback, useEffect, useState } from "react";

type AlertRow = {
  id: string;
  externalId: string;
  type: "Alert" | "Clear";
  status: "open" | "cleared" | "unmatched";
  eventDateTime: string;
  facilityCode: string | null;
  locationName: string | null;
  locationBuilding: string | null;
  residentFirstName: string | null;
  residentLastName: string | null;
  deviceName: string | null;
  deviceType: string | null;
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    notifyClientId: string | null;
  } | null;
  conversation: { id: string } | null;
};

type AlertsPanelProps = {
  onOpenConversation?: (conversationId: string) => void;
};

export function AlertsPanel({ onOpenConversation }: AlertsPanelProps) {
  const [status, setStatus] = useState<"all" | "open" | "cleared" | "unmatched">("open");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadAlerts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = status === "all" ? "" : `?status=${status}`;
      const response = await fetch(`/api/alerts${query}`);
      if (!response.ok) {
        throw new Error("Failed to load alerts.");
      }
      const data = await response.json();
      setAlerts(data.alerts ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load alerts.");
    } finally {
      setIsLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void loadAlerts();
    const interval = setInterval(() => {
      void loadAlerts();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  return (
    <div className="rounded-xl border border-border bg-white p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Notify Alerts</p>
        <select
          className="rounded-md border border-border px-2 py-1 text-xs"
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as "all" | "open" | "cleared" | "unmatched")
          }
        >
          <option value="open">Open</option>
          <option value="unmatched">Unmatched</option>
          <option value="cleared">Cleared</option>
          <option value="all">All</option>
        </select>
      </div>

      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
      {isLoading && !alerts.length ? (
        <p className="mt-2 text-xs text-muted">Loading alerts…</p>
      ) : null}

      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
        {alerts.map((alert) => {
          const resident = [alert.residentFirstName, alert.residentLastName]
            .filter(Boolean)
            .join(" ");
          const location = [alert.locationBuilding, alert.locationName].filter(Boolean).join(" · ");
          return (
            <div key={alert.id} className="rounded-lg border border-border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">
                  {alert.type} · {alert.status}
                </p>
                <p className="text-[11px] text-muted">
                  {new Date(alert.eventDateTime).toLocaleString()}
                </p>
              </div>
              <p className="text-xs text-muted">ID: {alert.externalId}</p>
              {resident ? <p className="text-xs">{resident}</p> : null}
              {location ? <p className="text-xs text-muted">{location}</p> : null}
              {alert.deviceType || alert.deviceName ? (
                <p className="text-xs text-muted">
                  {[alert.deviceType, alert.deviceName].filter(Boolean).join(" · ")}
                </p>
              ) : null}
              {alert.contact ? (
                <p className="text-xs text-muted">
                  Contact: {alert.contact.name ?? alert.contact.notifyClientId ?? alert.contact.phone}
                </p>
              ) : (
                <p className="text-xs text-amber-700">No matching Notify contact</p>
              )}
              {alert.conversation && onOpenConversation ? (
                <button
                  type="button"
                  className="mt-1 text-xs font-medium text-indigo-700 underline"
                  onClick={() => onOpenConversation(alert.conversation!.id)}
                >
                  Open conversation
                </button>
              ) : null}
            </div>
          );
        })}
        {!alerts.length && !isLoading ? (
          <p className="text-xs text-muted">No alerts in this filter.</p>
        ) : null}
      </div>
    </div>
  );
}
