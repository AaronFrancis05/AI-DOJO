// components/Skeleton.tsx
//
// Upgrade notes (why this differs from the previous version):
// 1. Replaced `animate-pulse` (opacity fade — the default Tailwind look every
//    bootstrapped app ships with) with a gradient "shimmer sweep" — a light
//    band moving left-to-right across each block. This is the pattern used by
//    Linear, Vercel, and Stripe and reads as "actively loading" rather than
//    "content is greyed out."
// 2. Rows/blocks stagger their animation start (`--shimmer-delay`) instead of
//    pulsing in unison, which is what makes hand-built skeletons look
//    engineered rather than copy-pasted from one <Skeleton /> instance.
// 3. ChatSkeleton/ChatPageSkeleton now mirror the ACTUAL page chrome — header,
//    scroll area, pinned composer — inside the same max-width container the
//    real page uses, so nothing shifts or looks orphaned on swap-in. This
//    directly fixes the broken-looking centered box from your screenshots.
// 4. Added <TopProgressBar /> — a thin route-level loading indicator (GitHub/
//    Vercel-style) to cover the moment BEFORE a page's own skeleton mounts,
//    so route changes don't show a blank white flash.
//
// Requires the shimmer keyframes below to be added once to your globals.css:
//
// @keyframes shimmer-sweep {
//   0%   { background-position: -150% 0; }
//   100% { background-position: 150% 0; }
// }
// @keyframes progress-indeterminate {
//   0%   { transform: translateX(-100%) scaleX(0.4); }
//   50%  { transform: translateX(20%) scaleX(0.6); }
//   100% { transform: translateX(120%) scaleX(0.4); }
// }

export function Skeleton({
  className = '',
  delay = 0,
}: {
  className?: string;
  delay?: number;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-md bg-neutral-200/70 dark:bg-neutral-800 animate-shimmer-sweep ${className}`}
      role="presentation"
      style={{
        backgroundImage:
          'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%)',
        backgroundSize: '200% 100%',
        animationDelay: `${delay}ms`,
      }}
    />
  );
}

// ---------- Dashboard ----------

export function ScenarioCardSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="rounded-2xl border border-neutral-200 p-5 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-2/3" delay={delay} />
        <Skeleton className="h-5 w-14 rounded-full" delay={delay + 40} />
      </div>
      <Skeleton className="mt-3 h-4 w-full" delay={delay + 80} />
      <Skeleton className="mt-2 h-4 w-4/5" delay={delay + 120} />
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" delay={delay + 160} />
        <Skeleton className="h-6 w-20 rounded-full" delay={delay + 200} />
      </div>
    </div>
  );
}

export function ScenarioGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-live="polite">
      <span className="sr-only">Loading scenarios…</span>
      {Array.from({ length: count }).map((_, i) => (
        <ScenarioCardSkeleton key={i} delay={(i % 3) * 90} />
      ))}
    </div>
  );
}

// ---------- Sessions ----------

export function SessionRowSkeleton({ delay = 0 }: { delay?: number }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex-1">
        <Skeleton className="h-5 w-1/3" delay={delay} />
        <div className="mt-2 flex gap-3">
          <Skeleton className="h-3 w-16" delay={delay + 60} />
          <Skeleton className="h-3 w-24" delay={delay + 100} />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-16 rounded-md" delay={delay + 140} />
        <Skeleton className="h-8 w-10 rounded-md" delay={delay + 180} />
        <Skeleton className="h-8 w-10 rounded-md" delay={delay + 220} />
      </div>
    </div>
  );
}

export function SessionListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <span className="sr-only">Loading sessions…</span>
      {Array.from({ length: count }).map((_, i) => (
        <SessionRowSkeleton key={i} delay={i * 70} />
      ))}
    </div>
  );
}

// ---------- Chat ----------

// Varied widths so bubbles don't look like a repeated template.
const BUBBLE_WIDTHS_LEFT = ['w-2/3', 'w-1/2', 'w-3/5'];
const BUBBLE_WIDTHS_RIGHT = ['w-2/5', 'w-1/3'];

export function ChatBubbleSkeleton({
  align = 'left',
  width = 'w-2/3',
  delay = 0,
}: {
  align?: 'left' | 'right';
  width?: string;
  delay?: number;
}) {
  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <Skeleton
        className={`h-10 ${width} rounded-2xl ${
          align === 'right' ? 'rounded-br-sm' : 'rounded-bl-sm'
        }`}
        delay={delay}
      />
    </div>
  );
}

export function ChatSkeleton() {
  const sequence: Array<'left' | 'right'> = ['left', 'right', 'left', 'right'];
  return (
    <div className="flex flex-col gap-3 p-4">
      {sequence.map((align, i) => (
        <ChatBubbleSkeleton
          key={i}
          align={align}
          width={
            align === 'left'
              ? BUBBLE_WIDTHS_LEFT[i % BUBBLE_WIDTHS_LEFT.length]
              : BUBBLE_WIDTHS_RIGHT[i % BUBBLE_WIDTHS_RIGHT.length]
          }
          delay={i * 90}
        />
      ))}
    </div>
  );
}

// Shared layout shell used by ChatPageSkeleton and the live chat page.
// Extracted so layout changes (maxWidth, padding, etc.) need only one update.
export const CHAT_PAGE_SHELL_STYLE = {
  maxWidth: '650px',
  margin: '40px auto',
  padding: '20px',
  fontFamily: 'sans-serif',
} as const;

export function ChatPageShell({ children }: { children: React.ReactNode }) {
  return <div style={CHAT_PAGE_SHELL_STYLE}>{children}</div>;
}

// Full chat-page skeleton: mirrors real page chrome (header, scroll area,
// pinned composer) inside the same max-width container as the live page —
// this is the direct fix for the orphaned-box look in your screenshots.
export function ChatPageSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading chat…</span>
      <ChatPageShell>
        {/* header: back link + action buttons, matches real chat header */}
        <div className="mb-[10px] flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <div className="flex gap-2">
            <Skeleton className="h-[34px] w-[58px] rounded-md" delay={30} />
            <Skeleton className="h-[34px] w-[34px] rounded-md" delay={60} />
            <Skeleton className="h-[34px] w-[96px] rounded-md" delay={90} />
          </div>
        </div>

        {/* scenario title */}
        <Skeleton className="mb-1 h-6 w-48" delay={20} />

        {/* character info */}
        <Skeleton className="mb-1 h-4 w-72" delay={50} />

        {/* you-are info banner */}
        <Skeleton className="mb-5 h-9 w-full rounded-md" delay={80} />

        {/* message area */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800">
          <ChatSkeleton />
        </div>

        {/* pinned composer */}
        <div className="mt-4 flex items-center gap-2">
          <Skeleton className="h-11 flex-1 rounded-md" delay={120} />
          <Skeleton className="h-11 w-[72px] rounded-md" delay={160} />
        </div>
      </ChatPageShell>
    </div>
  );
}

// ---------- Typing indicator (chat "in flight" state, not initial load) ----------

export function TypingIndicator() {
  return (
    <div className="flex w-fit gap-1 rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3 dark:bg-neutral-800" role="status" aria-label="AI is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-neutral-400 dark:bg-neutral-500 animate-typing-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ---------- Shared session view ----------

export function SharedSessionSkeleton() {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading shared session…</span>
      <div className="mb-6 text-center">
        <Skeleton className="mx-auto h-6 w-56" />
        <Skeleton className="mx-auto mt-2 h-4 w-40" delay={40} />
      </div>
      <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <Skeleton className="h-6 w-48" delay={80} />
        <div className="mt-3 flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" delay={120} />
          <Skeleton className="h-5 w-20 rounded-full" delay={160} />
        </div>
        <Skeleton className="mt-3 h-4 w-full" delay={200} />
        <Skeleton className="mt-1.5 h-4 w-4/5" delay={240} />
      </div>
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900">
        <Skeleton className="h-5 w-48" />
        <div className="mt-4">
          <ChatSkeleton />
        </div>
      </div>
    </div>
  );
}

// ---------- Route-level loader ----------

// Thin indeterminate progress bar for the moment BEFORE a page's own
// skeleton has mounted (e.g. during router.push()). Mount conditionally
// on your navigation-pending state (router events / a loading.tsx boundary).
export function TopProgressBar() {
  return (
    <div className="fixed left-0 top-0 z-50 h-[2px] w-full overflow-hidden bg-transparent">
      <div className="h-full w-full bg-neutral-900 dark:bg-white animate-progress-indeterminate" />
    </div>
  );
}
