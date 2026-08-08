export type ContactTransport = "sms" | "notify";

export type NotifyKind = "individual" | "channel";

export type ContactIdentityFields = {
  phone?: string | null;
  notifyClientId?: string | null;
  notifyChannelId?: string | null;
};

function countIdentities(contact: ContactIdentityFields): number {
  return (
    (contact.phone?.trim() ? 1 : 0) +
    (contact.notifyClientId?.trim() ? 1 : 0) +
    (contact.notifyChannelId?.trim() ? 1 : 0)
  );
}

export function getContactTransport(contact: ContactIdentityFields): ContactTransport | null {
  if (countIdentities(contact) !== 1) return null;
  if (contact.phone?.trim()) return "sms";
  return "notify";
}

export function getNotifyKind(contact: ContactIdentityFields): NotifyKind | null {
  if (getContactTransport(contact) !== "notify") return null;
  if (contact.notifyChannelId?.trim()) return "channel";
  if (contact.notifyClientId?.trim()) return "individual";
  return null;
}

export function assertContactIdentityXor(contact: ContactIdentityFields): ContactTransport {
  const transport = getContactTransport(contact);
  if (!transport) {
    throw new Error(
      "A contact must have exactly one of: phone number, Notify client ID, or Notify channel ID.",
    );
  }
  return transport;
}

export function contactDisplayIdentity(contact: {
  name?: string | null;
  phone?: string | null;
  notifyClientId?: string | null;
  notifyChannelId?: string | null;
}): string {
  if (contact.name?.trim()) return contact.name.trim();
  if (contact.phone?.trim()) return contact.phone.trim();
  if (contact.notifyChannelId?.trim()) return `Notify channel ${contact.notifyChannelId.trim()}`;
  if (contact.notifyClientId?.trim()) return `Notify ${contact.notifyClientId.trim()}`;
  return "Unknown contact";
}

export function contactSecondaryIdentity(contact: ContactIdentityFields): string {
  if (contact.phone?.trim()) return contact.phone.trim();
  if (contact.notifyChannelId?.trim()) return contact.notifyChannelId.trim();
  if (contact.notifyClientId?.trim()) return contact.notifyClientId.trim();
  return "";
}

export function isSmsContact(contact: ContactIdentityFields): boolean {
  return getContactTransport(contact) === "sms";
}

export function isNotifyContact(contact: ContactIdentityFields): boolean {
  return getContactTransport(contact) === "notify";
}

export function isNotifyChannelContact(contact: ContactIdentityFields): boolean {
  return getNotifyKind(contact) === "channel";
}

export function isNotifyIndividualContact(contact: ContactIdentityFields): boolean {
  return getNotifyKind(contact) === "individual";
}
