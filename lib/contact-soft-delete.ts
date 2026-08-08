export const ACTIVE_CONTACT_WHERE = { deletedAt: null } as const;

export function isSoftDeleted(contact: { deletedAt: Date | null }): boolean {
  return contact.deletedAt != null;
}

export type ContactIdentityCreateAction = "restore" | "conflict" | "reuse";

export function decideContactIdentityCreateAction(existing: {
  deletedAt: Date | null;
  hasActiveConversation: boolean;
}): ContactIdentityCreateAction {
  if (existing.deletedAt != null) {
    return "restore";
  }
  if (existing.hasActiveConversation) {
    return "conflict";
  }
  return "reuse";
}
