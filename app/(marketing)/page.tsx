import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { PlayCircle, ChevronRight, Mic } from 'lucide-react';

export default async function LandingPage() {
  const user = await getAuthUserReadOnly();

  if (user) {
    redirect('/home');
  }

  const domains = [
    { icon: '🍜', name: 'Restaurant', desc: 'Practice ordering food, making reservations...', count: '20+ Situations' },
    { icon: '✈️', name: 'Travel', desc: 'Airports, hotels, directions...', count: '18+ Situations' },
    { icon: '💼', name: 'Business', desc: 'Meetings, presentations, negotiations...', count: '16+ Situations' },
    { icon: '🏥', name: 'Healthcare', desc: 'Doctor visits, pharmacy, emergencies...', count: '16+ Situations' },
    { icon: '🛍️', name: 'Shopping', desc: 'Ask for help, compare items...', count: '16+ Situations' },
    { icon: '📚', name: 'Education', desc: 'School life, teachers, classmates...', count: '12+ Situations' },
    { icon: '🏠', name: 'Daily Life', desc: 'Small talks, hobbies, family...', count: '20+ Situations' },
  ];

  const stats = [
    { icon: '👥', value: '50K+', label: 'Active Learners' },
    { icon: '💬', value: '1M+', label: 'Conversations' },
    { icon: '✅', value: '98%', label: 'Satisfaction Rate' },
    { icon: '🕐', value: '24/7', label: 'AI Support' },
    { icon: '🌍', value: '20+', label: 'Languages Supported' },
    { icon: '🥋', value: '8+', label: 'Realistic Domains' },
  ];

  const testimonials = [
    { initial: 'S', name: 'Sarah Chen', sub: 'Learning Japanese', quote: 'AI DOJO helped me gain the confidence to speak Japanese naturally. The roleplay scenarios feel so real!' },
    { initial: 'J', name: 'James Wilson', sub: 'Learning Korean', quote: "The AI characters are incredibly engaging and the feedback is instant. It's like having a personal tutor anytime." },
    { initial: 'M', name: 'Maria Garcia', sub: 'Learning English', quote: 'Finally, a platform that makes language learning fun and effective. Highly recommended!' },
  ];

  return (
    <div className="min-h-screen bg-dojo-canvas text-dojo-text-primary">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 h-16 w-full border-b border-dojo-border bg-dojo-canvas">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2 text-xl font-bold text-dojo-text-primary">
            <span>🥋</span>
            AI DOJO
          </div>

          <div className="hidden items-center gap-8 md:flex">
            {['Features', 'Domains', 'How it Works'].map((link) => (
              <Link
                key={link}
                href="#"
                className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
              >
                {link}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/auth"
              className="px-4 py-2 text-sm text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
            >
              Sign in
            </Link>
            <Link
              href="/auth"
              className="rounded-full bg-dojo-accent px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="mx-auto max-w-7xl px-6 pt-20 pb-24">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* LEFT COLUMN */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-dojo-accent/30 bg-dojo-accent/10 px-4 py-1.5">
              <span className="h-2 w-2 rounded-full bg-dojo-success animate-pulse" />
              <span className="text-xs text-dojo-text-muted">AI-Powered Language Learning</span>
            </div>

            <h1 className="text-5xl font-bold leading-tight tracking-tight lg:text-6xl">
              <span className="block text-dojo-text-primary">Speak Any Language</span>
              <span className="block text-dojo-text-primary">As If You Were</span>
              <span className="bg-gradient-to-r from-dojo-accent to-purple-400 bg-clip-text text-transparent">
                Really There
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-dojo-text-muted">
              Practice real-world conversations with AI characters in immersive scenarios. Get instant feedback and improve faster through roleplay.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                href="/auth"
                className="rounded-lg bg-dojo-accent px-7 py-3 font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start Free — No Card
              </Link>
              <Link
                href="#"
                className="flex items-center gap-2 rounded-lg border border-dojo-border px-7 py-3 text-dojo-text-muted transition-colors hover:border-dojo-accent hover:text-dojo-text-primary"
              >
                <PlayCircle className="h-4 w-4" />
                Watch Demo
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                { icon: '🌐', label: '8+ Realistic Domains' },
                { icon: '🎤', label: 'Real-time Voice Chat' },
                { icon: '⚡', label: 'Instant Feedback' },
                { icon: '📊', label: 'Track Progress' },
              ].map((pill) => (
                <div key={pill.label} className="flex items-center gap-2 text-xs text-dojo-text-muted">
                  <span>{pill.icon}</span>
                  {pill.label}
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN — Live session demo card */}
          <div className="relative">
            <div className="overflow-hidden rounded-2xl border border-dojo-border bg-dojo-surface shadow-2xl shadow-dojo-accent/10">
              {/* TOP BAR */}
              <div className="flex items-center gap-2 border-b border-dojo-border px-4 py-2.5">
                <span className="flex items-center gap-1.5 rounded-full bg-dojo-danger px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  <span className="h-1 w-1 rounded-full bg-white animate-pulse" />
                  LIVE
                </span>
                <span className="text-sm font-medium text-dojo-text-primary">Restaurant</span>
              </div>

              {/* AVATAR AREA */}
              <div className="relative h-64 overflow-hidden">
                <Image
                  src="/avatar.png"
                  alt="Yuki Tanaka"
                  fill
                  className="object-cover object-top brightness-90"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
                />
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-dojo-surface to-transparent" />

                {/* Speech bubble */}
                <div className="absolute top-4 right-4 left-4 ml-auto max-w-[75%] rounded-xl border border-dojo-border bg-dojo-surface-raised/95 p-3 shadow-lg backdrop-blur-md">
                  <p className="text-sm font-medium text-dojo-text-primary">いらっしゃいませ！</p>
                  <p className="mt-1 text-xs italic text-dojo-text-muted">Welcome! Have you decided your order?</p>
                </div>

                {/* Mic listening area */}
                <div className="absolute bottom-3 inset-x-0 flex flex-col items-center gap-1">
                  <div className="flex items-end gap-1">
                    {[8, 20, 12, 18, 8].map((h, i) => (
                      <div
                        key={i}
                        className="w-[3px] rounded-full bg-dojo-accent animate-pulse"
                        style={{ height: `${h}px` }}
                      />
                    ))}
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dojo-accent shadow-lg shadow-dojo-accent/40">
                    <Mic className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-xs text-dojo-text-muted">Listening...</span>
                </div>
              </div>

              {/* BOTTOM STATS ROW */}
              <div className="flex items-center justify-between border-t border-dojo-border px-4 py-3">
                <div>
                  <div className="mb-1 text-xs text-dojo-text-muted">Conversation Progress</div>
                  <div className="h-1.5 w-40 rounded-full bg-dojo-border">
                    <div className="h-full w-[72%] rounded-full bg-dojo-success" />
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="rounded-lg border border-dojo-border bg-dojo-surface-raised px-3 py-1.5">
                    <div className="text-[10px] text-dojo-text-muted">Session XP</div>
                    <div className="text-sm font-bold text-dojo-text-primary">+120 XP ⭐</div>
                  </div>
                  <div className="rounded-lg border border-dojo-border bg-dojo-surface-raised px-3 py-1.5">
                    <div className="text-[10px] text-dojo-text-muted">Current Streak</div>
                    <div className="text-sm font-bold text-dojo-streak">12 days 🔥</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DOMAINS SECTION */}
      <section className="border-y border-dojo-border bg-dojo-surface/40 py-20">
        <h2 className="text-center text-3xl font-bold text-dojo-text-primary">Practice in Real-World Domains</h2>
        <p className="mt-2 text-center text-dojo-text-muted">Choose a scenario and start your immersive roleplay journey</p>

        <div className="mx-auto mt-12 flex max-w-7xl gap-4 overflow-x-auto px-6 pb-4">
          {domains.map((domain) => (
            <div
              key={domain.name}
              className="w-48 shrink-0 cursor-pointer rounded-xl border border-dojo-border bg-dojo-surface-raised p-5 transition-colors hover:border-dojo-accent/50"
            >
              <div className="mb-3 text-2xl">{domain.icon}</div>
              <div className="text-sm font-semibold text-dojo-text-primary">{domain.name}</div>
              <div className="mt-1 line-clamp-3 text-xs leading-relaxed text-dojo-text-muted">{domain.desc}</div>
              <div className="mt-3 text-[10px] font-medium text-dojo-accent">{domain.count}</div>
            </div>
          ))}
          <div className="w-48 shrink-0 cursor-pointer rounded-xl border border-dojo-border bg-dojo-surface-raised p-5 transition-colors hover:border-dojo-accent/50">
            <div className="mb-3 text-2xl">➕</div>
            <div className="text-sm font-semibold text-dojo-text-primary">More Coming</div>
            <div className="mt-1 text-xs leading-relaxed text-dojo-text-muted">New domains added regularly</div>
            <div className="mt-3 text-[10px] font-medium text-dojo-text-muted">Stay tuned</div>
          </div>
          <button className="flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-full border border-dojo-border text-dojo-text-muted">
            <ChevronRight />
          </button>
        </div>
      </section>

      {/* STATS ROW */}
      <section className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 py-14 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="mb-2 text-xl">{stat.icon}</div>
            <div className="text-2xl font-bold text-dojo-text-primary">{stat.value}</div>
            <div className="mt-1 text-xs text-dojo-text-muted">{stat.label}</div>
          </div>
        ))}
      </section>

      {/* TESTIMONIALS SECTION */}
      <section className="mx-auto max-w-7xl px-6 py-20">
        <h2 className="text-center text-3xl font-bold text-dojo-text-primary">Loved by Learners Worldwide</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <div key={i} className="rounded-2xl border border-dojo-border bg-dojo-surface-raised p-6">
              <div className="mb-4 flex gap-1 text-sm text-dojo-warning">
                {Array(5).fill(0).map((_, j) => <span key={j}>⭐</span>)}
              </div>
              <p className="text-sm leading-relaxed text-dojo-text-muted">{t.quote}</p>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dojo-accent/30 bg-dojo-accent/20 text-sm font-bold text-dojo-accent">
                  {t.initial}
                </div>
                <div>
                  <div className="text-sm font-semibold text-dojo-text-primary">{t.name}</div>
                  <div className="text-xs text-dojo-text-muted">{t.sub}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BOTTOM CTA BANNER */}
      <section className="mx-6 mb-16 max-w-7xl rounded-2xl border border-dojo-accent/30 bg-gradient-to-r from-dojo-accent/20 via-dojo-sidebar to-dojo-accent/10 px-10 py-14 lg:mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-8">
          <div>
            <h2 className="text-2xl font-bold text-dojo-text-primary">Ready to Start Your Journey?</h2>
            <p className="mt-2 text-dojo-text-muted">Join thousands of learners improving their speaking skills with AI.</p>
          </div>
          <Link
            href="/auth"
            className="whitespace-nowrap rounded-full bg-dojo-accent px-8 py-3 font-semibold text-white transition-opacity hover:opacity-90"
          >
            Start Free Now →
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-dojo-border py-8 text-center text-sm text-dojo-text-muted">
        © 2024 AI DOJO — Japanese Role-Play Training
      </footer>
    </div>
  );
}
