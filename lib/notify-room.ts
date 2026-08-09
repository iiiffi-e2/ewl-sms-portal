// lib/notify-room.ts
const ROOM_PATTERN =
  /\b(?:Room|Rm|Apartment|Apt)\s+([A-Za-z0-9-]+)\b/i;

export function extractRoomMention(body: string): string | null {
  const match = body.match(ROOM_PATTERN);
  const token = match?.[1]?.trim();
  return token ? token : null;
}
