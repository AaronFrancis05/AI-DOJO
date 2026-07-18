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
    { icon: '🥋', value: '8+', label: 'Realistic Scenarios' },
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
            {['Features', 'Scenarios', 'How it Works'].map((link) => (
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
            
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight tracking-tight lg:text-6xl">
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
  <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0E1425] shadow-[0_30px_80px_rgba(93,91,255,0.18)]">

    {/* VIDEO PREVIEW */}
    <div className="relative aspect-[16/11] overflow-hidden rounded-[28px]">


      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/25 to-black/55" />

      {/* LIVE BADGE */}
      <div className="absolute left-5 top-5 flex items-center gap-3 rounded-full border border-white/10 bg-black/45 px-4 py-2 backdrop-blur-xl">

        <div className="flex items-center gap-2">

          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />

          <span className="text-[11px] font-semibold uppercase tracking-wide text-white">
            Live
          </span>

        </div>

        <span className="text-sm text-white/80">
          Restaurant
        </span>

      </div>
      {/* Conversation Bubble */}
      <div className="absolute left-6 z-1 top-20 max-w-[150px] rounded-2xl border border-white/10 bg-black/55 p-4 backdrop-blur-xl">

        <p className="text-lg font-semibold text-white">
          いらっしゃいませ！
        </p>

        <p className="mt-1 text-base text-white">
          ご注文はお決まりですか？
        </p>

        <p className="mt-4 text-sm italic text-gray-300">
          Welcome! Have you decided your order?
        </p>

      </div>

      

      {/* Avatar */}
      <Image
        src="/avatar.png"
        alt="Yuki Tanaka"
        width={700}
        height={900}
        className="
          absolute
          bottom-0
          left-1/2
          w-[46%]
          -translate-x-1/2
          object-contain
          drop-shadow-[0_25px_60px_rgba(0,0,0,.55)]
        "
      />

      {/* Voice Wave */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2">

        <div className="flex items-center gap-[3px]">

          {[8,12,16,20,14,10,8,14,22,18,12,8,10,16,20,12].map((h,i)=>(
            <span
              key={i}
              className="w-[2px] rounded-full bg-indigo-400 animate-pulse"
              style={{
                height:h
              }}
            />
          ))}

        </div>

        <button className="mx-auto mt-5 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 shadow-[0_0_35px_rgba(99,102,241,.65)]">

          <Mic className="h-7 w-7 text-white"/>

        </button>

        <p className="mt-3 text-center text-sm text-white">
          Listening...
        </p>

      </div>

      {/* Progress Card */}
      <div className="absolute bottom-5 left-5 w-56 rounded-2xl border border-white/10 bg-black/45 p-4 backdrop-blur-xl">

        <div className="mb-3 flex justify-between text-sm">

          <span className="text-white/70">
            Conversation Progress
          </span>

          <span className="text-white">
            72%
          </span>

        </div>

        <div className="h-2 overflow-hidden rounded-full bg-white/10">

          <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-cyan-400 to-green-400"/>

        </div>

      </div>

      {/* XP Card */}
      <div className="absolute bottom-5 right-5 space-y-3">

        <div className="rounded-2xl border border-white/10 bg-black/45 px-5 py-4 backdrop-blur-xl">

          <p className="text-xs text-white/60">
            Session XP
          </p>

          <p className="mt-1 text-2xl font-bold text-white">
            +120 XP ⭐
          </p>

        </div>

        <div className="rounded-2xl border border-white/10 bg-black/45 px-5 py-4 backdrop-blur-xl">

          <p className="text-xs text-white/60">
            Current Streak
          </p>

          <p className="mt-1 text-xl font-semibold text-orange-400">
            12 Days 🔥
          </p>

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
            <div className="mt-1 text-xs leading-relaxed text-dojo-text-muted">New scenarios added regularly</div>
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

      

      {/* BOTTOM CTA BANNER */}
      <section className="mx-4 sm:mx-6 my-36 max-w-7xl rounded-2xl border border-dojo-accent/30 bg-gradient-to-r from-dojo-accent/20 via-dojo-sidebar to-dojo-accent/10 px-6 sm:px-10 py-14 lg:mx-auto">
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
        © 2026 AI DOJO   -     Immersive Language Role-Play Training
      </footer>
    </div>
  );
}
