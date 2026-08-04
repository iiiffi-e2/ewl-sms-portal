export type NotifyAlertPayload = {
  version?: string;
  vendor?: string;
  id: string;
  type: "Alert" | "Clear";
  eventDateTime: string;
  ackDateTime?: string;
  location?: {
    name?: string;
    building?: string;
  };
  resident?: {
    firstName?: string;
    lastName?: string;
  };
  device?: {
    name?: string;
    type?: string;
  };
  near?: Array<{ name?: string }>;
};

export type NotifyAlertDisplay = {
  title: string;
  cleared: boolean;
  lines: string[];
};

function uniqueJoined(parts: Array<string | null | undefined>, separator = " · "): string | null {
  const values = parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part));
  const unique = [...new Set(values)];
  return unique.length ? unique.join(separator) : null;
}

export function formatAlertSystemMessage(
  payload: NotifyAlertPayload,
  kind: "Alert" | "Clear",
): string {
  const resident = uniqueJoined([payload.resident?.firstName, payload.resident?.lastName], " ");
  const location = uniqueJoined([payload.location?.building, payload.location?.name]);
  const device = uniqueJoined([payload.device?.type, payload.device?.name]);

  const lines = [
    kind === "Alert" ? "Alert received" : "Alert cleared",
    resident ? `Resident: ${resident}` : null,
    location ? `Location: ${location}` : null,
    device ? `Device: ${device}` : null,
  ].filter(Boolean);

  return lines.join("\n");
}

export function isNotifyAlertSystemMessage(body: string): boolean {
  const trimmed = body.trim();
  return (
    trimmed.startsWith("Alert received") ||
    trimmed.startsWith("Alert cleared") ||
    trimmed.startsWith("Notify alert received") ||
    trimmed.startsWith("Notify alert cleared")
  );
}

export function isNotifyAlertClearedMessage(body: string): boolean {
  const trimmed = body.trim();
  return trimmed.startsWith("Alert cleared") || trimmed.startsWith("Notify alert cleared");
}

/**
 * Parse stored alert system-message bodies (new multiline or legacy one-line)
 * into a title + detail lines for the chat bubble.
 */
export function parseNotifyAlertDisplay(body: string): NotifyAlertDisplay | null {
  if (!isNotifyAlertSystemMessage(body)) return null;

  const cleared = isNotifyAlertClearedMessage(body);
  const title = cleared ? "Notify alert cleared" : "Notify alert received";
  const lines: string[] = [];

  const multiline = body.includes("\n");
  if (multiline) {
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (
        line === "Alert received" ||
        line === "Alert cleared" ||
        line === "Notify alert received." ||
        line === "Notify alert cleared." ||
        line.startsWith("Event:")
      ) {
        continue;
      }
      lines.push(line);
    }
    return { title, cleared, lines };
  }

  // Legacy one-line: "Notify alert received. Resident: X Location: Y Device: Z Event: ..."
  const detail = body
    .replace(/^Notify alert (received|cleared)\.?\s*/i, "")
    .replace(/^Alert (received|cleared)\.?\s*/i, "")
    .trim();

  const matches = detail.matchAll(
    /\b(Resident|Location|Device):\s*(.*?)(?=\s+(?:Resident|Location|Device|Event):|$)/g,
  );
  for (const match of matches) {
    const label = match[1];
    const value = match[2]?.trim();
    if (!label || !value) continue;
    if (label === "Device") {
      const device = uniqueJoined(value.split("·").map((part) => part.trim()));
      if (device) lines.push(`Device: ${device}`);
      continue;
    }
    lines.push(`${label}: ${value}`);
  }

  return { title, cleared, lines };
}
