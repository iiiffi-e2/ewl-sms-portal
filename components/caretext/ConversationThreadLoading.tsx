export function ConversationThreadLoading() {
  return (
    <div
      className="flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border bg-slate-50 p-4"
      aria-busy="true"
      aria-label="Loading conversation"
    >
      <div className="flex justify-start">
        <div className="h-16 w-[65%] animate-pulse rounded-2xl bg-slate-200" />
      </div>
      <div className="flex justify-end">
        <div className="h-12 w-[55%] animate-pulse rounded-2xl bg-indigo-100" />
      </div>
      <div className="flex justify-start">
        <div className="h-20 w-[70%] animate-pulse rounded-2xl bg-slate-200" />
      </div>
      <div className="flex justify-end">
        <div className="h-14 w-[50%] animate-pulse rounded-2xl bg-indigo-100" />
      </div>
    </div>
  );
}
