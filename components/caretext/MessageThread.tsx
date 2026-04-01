import { MessageBubble } from "@/components/caretext/MessageBubble";

type Message = {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  status: string;
  createdAt: string;
};

export function MessageThread({ messages }: { messages: Message[] }) {
  if (!messages.length) {
    return (
      <div className="h-full w-full rounded-xl border border-dashed border-border bg-white p-6 text-sm text-muted">
        No messages yet. Send the first SMS to start this conversation.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-slate-50 p-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          body={message.body}
          direction={message.direction}
          status={message.status}
          createdAt={message.createdAt}
        />
      ))}
    </div>
  );
}
