export type ContactTransport = "sms" | "notify";

export type ContactIdentityFields = {
  phone?: string | null;
  notifyClientId?: string | null;
};

export function getContactTransport(contact: ContactIdentityFields): ContactTransport | null {
  const hasPhone = Boolean(contact.phone?.trim());
  const hasNotify = Boolean(contact.notifyClientId?.trim());
  if (hasPhone && !hasNotify) return "sms";
  if (hasNotify && !hasPhone) return "notify";
  return null;
}

export function assertContactIdentityXor(contact: ContactIdentityFields): ContactTransport {
  const transport = getContactTransport(contact);
  if (!transport) {
    throw new Error("A contact must have either a phone number or a Notify client ID, not both or neither.");
  }
  return transport;
}

export function contactDisplayIdentity(contact: {
  name?: string | null;
  phone?: string | null;
  notifyClientId?: string | null;
}): string {
  if (contact.name?.trim()) return contact.name.trim();
  if (contact.phone?.trim()) return contact.phone.trim();
  if (contact.notifyClientId?.trim()) return `Notify ${contact.notifyClientId.trim()}`;
  return "Unknown contact";
}

export function contactSecondaryIdentity(contact: ContactIdentityFields): string {
  if (contact.phone?.trim()) return contact.phone.trim();
  if (contact.notifyClientId?.trim()) return contact.notifyClientId.trim();
  return "";
}

export function isSmsContact(contact: ContactIdentityFields): boolean {
  return getContactTransport(contact) === "sms";
}

export function isNotifyContact(contact: ContactIdentityFields): boolean {
  return getContactTransport(contact) === "notify";
}
