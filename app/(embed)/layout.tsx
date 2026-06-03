import { AuthProvider } from "@/components/caretext/AuthProvider";

export default function EmbedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthProvider>
      <div className="h-dvh min-h-0 overflow-hidden p-2">{children}</div>
    </AuthProvider>
  );
}
