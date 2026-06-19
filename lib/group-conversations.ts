type ParticipantLike = { status: "pending_intro" | "active" | "removed" };
type ContactLike = { name: string | null; phone: string };

export function countActiveParticipants(participants: ParticipantLike[]): number {
  return participants.filter((p) => p.status === "active").length;
}

export function canActivateTwilioGroup(activeCount: number): boolean {
  return activeCount >= 2;
}

export function isGroupReadyForMessages(twilioConversationSid: string | null | undefined): boolean {
  return Boolean(twilioConversationSid);
}

export function buildDefaultGroupTitle(contacts: ContactLike[]): string {
  const labels = contacts.map((c) => c.name?.trim() || c.phone);
  if (labels.length <= 3) {
    return labels.join(", ");
  }
  return `${labels.slice(0, 3).join(", ")} + ${labels.length - 3} more`;
}
