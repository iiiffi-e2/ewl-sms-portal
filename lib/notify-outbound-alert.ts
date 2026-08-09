/**
 * PROVISIONAL until Notify confirms:
 * - Authorization: Bearer COMM_STACK_SDK_TOKEN
 * - payload.id: generated UUID
 * - note is NOT sent in Notify JSON (CareText audit only)
 * - location.building / resident / device omitted
 */
import { randomUUID } from "crypto";

function normalizeCommStackHost(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^http:\/\//i, "https://");
  }
  return `https://${trimmed}`;
}

export function buildNotifyAlertUrl(
  baseUrl: string,
  facilityCode: string,
  eventDateTime: string,
): string {
  const origin = normalizeCommStackHost(baseUrl);
  const encodedFacility = encodeURIComponent(facilityCode.trim());
  const params = new URLSearchParams({ eventDateTime });
  return `${origin}/palatiumCare/${encodedFacility}?${params.toString()}`;
}

export function buildOutboundAlertPayload(input: {
  id: string;
  eventDateTime: string;
  room: string;
}): Record<string, unknown> {
  return {
    version: "2.0",
    vendor: "Notify",
    id: input.id,
    type: "Alert" as const,
    eventDateTime: input.eventDateTime,
    location: { name: input.room.trim() },
  };
}

export async function sendOutboundNotifyAlert(input: {
  baseUrl: string;
  facilityCode: string;
  room: string;
  note?: string | null; // CareText-only until Notify confirms mapping
  sdkToken: string;
  fetchImpl?: typeof fetch;
}): Promise<{
  externalId: string;
  eventDateTime: string;
  requestPayload: unknown;
  responseStatus: number;
  responseBody: string;
  ok: boolean;
  note: string | null;
}> {
  const eventDateTime = new Date().toISOString();
  const externalId = randomUUID();
  const requestPayload = buildOutboundAlertPayload({
    id: externalId,
    eventDateTime,
    room: input.room,
  });
  const url = buildNotifyAlertUrl(input.baseUrl, input.facilityCode, eventDateTime);
  const fetchFn = input.fetchImpl ?? fetch;
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      // PROVISIONAL auth — confirm with Notify
      Authorization: `Bearer ${input.sdkToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestPayload),
  });
  const responseBody = await response.text();
  return {
    externalId,
    eventDateTime,
    requestPayload,
    responseStatus: response.status,
    responseBody,
    ok: response.ok,
    note: input.note ?? null,
  };
}
