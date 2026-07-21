'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-dojo-canvas px-6">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-dojo-danger/10">
          <AlertTriangle className="h-12 w-12 text-dojo-danger" />
        </div>
        <h1 className="text-2xl font-bold text-dojo-text-primary">
          Something Went Wrong
        </h1>
        <p className="mt-2 text-sm text-dojo-text-muted leading-relaxed">
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-dojo-text-muted/60 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-8 inline-flex items-center gap-2 rounded-[--radius-md] bg-dojo-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-dojo-accent/90"
        >
          <RefreshCw className="h-4 w-4" />
          Try Again
        </button>
      </div>
    </div>
  );
}
