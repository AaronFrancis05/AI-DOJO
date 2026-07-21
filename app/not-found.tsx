import Link from 'next/link';
import { SearchX, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-dojo-canvas px-6">
      <div className="flex flex-col items-center text-center max-w-sm">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-dojo-accent/10">
          <SearchX className="h-12 w-12 text-dojo-accent" />
        </div>
        <h1 className="text-4xl font-bold text-dojo-text-primary tracking-tight">
          404
        </h1>
        <p className="mt-2 text-lg font-semibold text-dojo-text-primary">
          Page Not Found
        </p>
        <p className="mt-2 text-sm text-dojo-text-muted leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/hub"
          className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-dojo-accent px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-dojo-accent/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Hub
        </Link>
      </div>
    </div>
  );
}
