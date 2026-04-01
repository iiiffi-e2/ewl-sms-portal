type ContactDetailsCardProps = {
  contact?: {
    name: string | null;
    phone: string;
    facility: string | null;
    notes: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
  };
};

export function ContactDetailsCard({ contact }: ContactDetailsCardProps) {
  if (!contact) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-white p-4 text-sm">
      <p className="font-semibold">Contact Details</p>
      <div className="mt-2 space-y-1 text-muted">
        <p>Name: {contact.name ?? "Unknown"}</p>
        <p>Phone: {contact.phone}</p>
        <p>Facility: {contact.facility ?? "N/A"}</p>
        <p>Emergency Contact: {contact.emergencyContactName ?? "N/A"}</p>
        <p>Emergency Phone: {contact.emergencyContactPhone ?? "N/A"}</p>
        <p>Notes: {contact.notes ?? "None"}</p>
      </div>
    </div>
  );
}
