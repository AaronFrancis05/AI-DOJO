import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUserReadOnly } from '@/lib/auth/server';

export default async function LandingPage() {
  const user = await getAuthUserReadOnly();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <span className="text-lg font-semibold tracking-tight text-neutral-900">
            🥋 AI DOJO
          </span>
          <Link
            href="/auth"
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-4xl px-4 py-24 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
            Master Japanese Through
            <span className="text-neutral-500"> AI Role-Play</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600">
            Practice real-world Japanese conversations with AI-powered characters.
            Choose from office scenarios, social situations, and daily-life interactions.
          </p>
          <div className="mt-10 flex items-center justify-center gap-4">
            <Link
              href="/auth"
              className="rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
            >
              Start training — it&apos;s free
            </Link>
            <Link
              href="/auth"
              className="rounded-lg border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
            >
              Learn more
            </Link>
          </div>
        </section>

        <section className="border-t border-neutral-200 bg-neutral-50">
          <div className="mx-auto max-w-5xl px-4 py-20">
            <h2 className="text-center text-2xl font-semibold text-neutral-900">
              How it works
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-xl">
                  🎭
                </div>
                <h3 className="font-semibold text-neutral-900">Choose a scenario</h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Pick from real-life situations like ordering at a restaurant, visiting a doctor, or meeting a client.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-xl">
                  💬
                </div>
                <h3 className="font-semibold text-neutral-900">Have a conversation</h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Speak naturally with an AI character. Get real-time corrections on grammar and word choice.
                </p>
              </div>
              <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-xl">
                  📊
                </div>
                <h3 className="font-semibold text-neutral-900">Track your progress</h3>
                <p className="mt-2 text-sm text-neutral-500">
                  Receive detailed evaluations on vocabulary, grammar, fluency, and cultural appropriateness.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-20 text-center">
          <h2 className="text-2xl font-semibold text-neutral-900">
            Ready to start speaking?
          </h2>
          <p className="mt-3 text-neutral-500">
            Create your free account and begin your first role-play session in minutes.
          </p>
          <Link
            href="/auth"
            className="mt-8 inline-block rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Create your account
          </Link>
        </section>
      </main>

      <footer className="border-t border-neutral-200 py-8 text-center text-sm text-neutral-400">
        AI DOJO — Japanese Role-Play Training
      </footer>
    </div>
  );
}
