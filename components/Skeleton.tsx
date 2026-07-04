// components/Skeleton.tsx
// Generic shimmer building block + a couple of pre-built layouts
// matching your scenario-card dashboard and chat views.

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200/80 ${className}`}
    />
  );
}

export function ScenarioCardSkeleton() {
  return (
    <div className="rounded-2xl border border-neutral-200 p-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  );
}

export function ScenarioGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <ScenarioCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ChatBubbleSkeleton({ align = 'left' }: { align?: 'left' | 'right' }) {
  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <Skeleton className={`h-10 w-2/3 rounded-2xl ${align === 'right' ? 'rounded-br-sm' : 'rounded-bl-sm'}`} />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <ChatBubbleSkeleton align="left" />
      <ChatBubbleSkeleton align="right" />
      <ChatBubbleSkeleton align="left" />
    </div>
  );
}
