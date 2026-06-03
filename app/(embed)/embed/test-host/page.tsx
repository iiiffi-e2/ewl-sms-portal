import { EMBED_INBOX_PATH } from "@/lib/embed";

export default function EmbedTestHostPage() {
  return (
    <main className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Embed inbox — same-origin test host</h1>
      <p className="text-sm text-muted">
        Confirms iframe framing headers and full-height layout. Use an external HTML file for cross-domain
        testing.
      </p>
      <iframe
        src={EMBED_INBOX_PATH}
        title="CareText embed inbox"
        className="h-[700px] w-full rounded-xl border border-border"
        allow="microphone"
      />
    </main>
  );
}
