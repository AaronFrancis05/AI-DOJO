import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getAuthUserReadOnly } from '@/lib/auth/server';

import {
  PlayCircleIcon,
  MicIcon,
  RestaurantIcon,
  TravelIcon,
  BusinessIcon,
  HealthcareIcon,
  ShoppingIcon,
  EducationIcon,
  DailyLifeIcon,
  MoreComingIcon,
  UsersIcon,
  ChatIcon,
  CheckmarkIcon,
  ClockIcon,
  GlobeIcon,
  ScenariosIcon,
  LightningIcon,
  ChartIcon,
  DojoLogo,
} from '@/components/Icons';

const domainIconMap: Record<string, React.FC<{ className?: string }>> = {
  Restaurant: RestaurantIcon,
  Travel: TravelIcon,
  Business: BusinessIcon,
  Healthcare: HealthcareIcon,
  Shopping: ShoppingIcon,
  Education: EducationIcon,
  'Daily Life': DailyLifeIcon,
};

const domains = [
  { icon: 'Restaurant', name: 'Restaurant', desc: 'Practice ordering food, making reservations...', count: '20+ Situations' },
  { icon: 'Travel', name: 'Travel', desc: 'Airports, hotels, directions...', count: '18+ Situations' },
  { icon: 'Business', name: 'Business', desc: 'Meetings, presentations, negotiations...', count: '16+ Situations' },
  { icon: 'Healthcare', name: 'Healthcare', desc: 'Doctor visits, pharmacy, emergencies...', count: '16+ Situations' },
  { icon: 'Shopping', name: 'Shopping', desc: 'Ask for help, compare items...', count: '16+ Situations' },
  { icon: 'Education', name: 'Education', desc: 'School life, teachers, classmates...', count: '12+ Situations' },
  { icon: 'Daily Life', name: 'Daily Life', desc: 'Small talks, hobbies, family...', count: '20+ Situations' },
];

const stats = [
  { icon: 'Users', value: '50K+', label: 'Active Learners' },
  { icon: 'Chat', value: '1M+', label: 'Conversations' },
  { icon: 'Checkmark', value: '98%', label: 'Satisfaction Rate' },
  { icon: 'Clock', value: '24/7', label: 'AI Support' },
  { icon: 'Globe', value: '20+', label: 'Languages Supported' },
  { icon: 'Scenarios', value: '8+', label: 'Realistic Scenarios' },
];

const statIconMap: Record<string, React.FC<{ className?: string }>> = {
  Users: UsersIcon,
  Chat: ChatIcon,
  Checkmark: CheckmarkIcon,
  Clock: ClockIcon,
  Globe: GlobeIcon,
  Scenarios: ScenariosIcon,
};

const features = [
  { icon: 'Globe', label: '8+ Realistic Domains' },
  { icon: 'Mic', label: 'Real-time Voice Chat' },
  { icon: 'Lightning', label: 'Instant Feedback' },
  { icon: 'Chart', label: 'Track Progress' },
];

const featureIconMap: Record<string, React.FC<{ className?: string }>> = {
  Globe: GlobeIcon,
  Mic: MicIcon,
  Lightning: LightningIcon,
  Chart: ChartIcon,
};

const navLinks = ['Features', 'Scenarios', 'How it Works'];

export default async function LandingPage() {
  const user = await getAuthUserReadOnly();

  if (user) {
    redirect('/home');
  }

  return (
    <div className="min-h-screen bg-dojo-canvas text-dojo-text-primary">
      {/* ── NAVBAR ── */}
      <nav className="sticky top-0 z-50 h-16 w-full border-b border-dojo-border bg-dojo-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-lg font-bold text-dojo-text-primary sm:text-xl">
            <DojoLogo className="h-7 w-7 sm:h-8 sm:w-8" />
            <span>AI DOJO</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link}
                href="#"
                className="text-sm font-medium text-dojo-text-muted transition-colors hover:text-dojo-text-primary"
              >
                {link}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/auth"
              className="rounded-lg px-3 py-2 text-sm font-medium text-dojo-text-muted transition-colors hover:text-dojo-text-primary sm:px-4"
            >
              Sign in
            </Link>
            <Link
              href="/auth"
              className="rounded-full bg-dojo-accent px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-dojo-accent/90 sm:px-5 sm:py-2.5"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <section className="mx-auto max-w-7xl px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-24 lg:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* LEFT COLUMN */}
          <div className="order-2 lg:order-1">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
              <span className="block text-dojo-text-primary">Speak Any Language</span>
              <span className="block text-dojo-text-primary">As If You Were</span>
              <span className="bg-gradient-to-r from-dojo-accent to-purple-400 bg-clip-text text-transparent">
                Really There
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-dojo-text-muted sm:text-lg">
              Practice real-world conversations with AI characters in immersive scenarios.
              Get instant feedback and improve faster through roleplay.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3 sm:mt-10 sm:gap-4">
              <Link
                href="/auth"
                className="rounded-lg bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 sm:px-7"
              >
                Start Free &mdash; No Card
              </Link>
              <Link
                href="#"
                className="flex items-center gap-2 rounded-lg border border-dojo-border px-6 py-3 text-dojo-text-muted transition-all hover:border-dojo-accent/50 hover:text-dojo-text-primary sm:px-7"
              >
                <PlayCircleIcon className="h-4 w-4" />
                Watch Demo
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2.5 sm:mt-8">
              {features.map((pill) => {
                const Icon = featureIconMap[pill.icon];
                return (
                  <div key={pill.label} className="flex items-center gap-2 text-xs text-dojo-text-muted sm:text-sm">
                    {Icon && <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                    {pill.label}
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT COLUMN — Live session demo card */}
          <div className="order-1 lg:order-2">
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0E1425] shadow-[0_30px_80px_rgba(93,91,255,0.18)] sm:rounded-3xl">
              <div className="relative aspect-[4/3] overflow-hidden sm:aspect-[16/11]">
                {/* Dark Overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/60" />

                {/* ── TOP ROW: Live Badge + XP Counter ── */}
                <div className="absolute left-3 right-3 top-3 flex items-center justify-between sm:left-5 sm:right-5 sm:top-5">
                  {/* Live Badge */}
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-xl sm:px-4 sm:py-2">
                    <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white sm:text-xs">Live</span>
                    <span className="ml-1 text-xs text-white/60 sm:text-sm">Restaurant</span>
                  </div>

                  {/* XP Badge (Desktop) */}
                  <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-black/50 px-4 py-2 backdrop-blur-xl sm:flex">
                    <span className="text-xs text-white/60">Session</span>
                    <span className="text-sm font-bold text-amber-400">+120 XP</span>
                  </div>
                </div>

                {/* ── CONVERSATION BUBBLE (left side) ── */}
                <div className="absolute left-3 top-16 max-w-[140px] rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-xl sm:left-6 sm:top-20 sm:max-w-[180px] sm:p-4">
                  <p className="text-sm font-semibold leading-snug text-white sm:text-base">
                    いらっしゃいませ！
                  </p>
                  <p className="mt-1 text-xs text-white/90 sm:mt-1.5 sm:text-sm">
                    ご注文はお決まりですか？
                  </p>
                  <p className="mt-2 text-[10px] italic text-gray-400 sm:mt-3 sm:text-xs">
                    &ldquo;Welcome! Have you decided your order?&rdquo;
                  </p>
                  {/* Tail indicator */}
                  <div className="absolute -left-1.5 top-4 h-3 w-3 rotate-45 border-l border-t border-white/10 bg-black/60" />
                </div>

                {/* ── AVATAR (centered, full height) ── */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative h-full w-full">
                    <Image
                      src="/avatar.png"
                      alt="Yuki Tanaka"
                      fill
                      className="object-contain object-bottom drop-shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
                      priority
                    />
                  </div>
                </div>

                {/* ── PROGRESS BAR (bottom) ── */}
                <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 sm:px-5 sm:pb-4">
                  <div className="rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 backdrop-blur-xl sm:rounded-2xl sm:px-4 sm:py-3">
                    <div className="mb-1.5 flex items-center justify-between sm:mb-2">
                      <span className="text-[10px] text-white/50 sm:text-xs">Conversation Progress</span>
                      <span className="text-[10px] font-semibold text-white sm:text-xs">72%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10 sm:h-2">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-dojo-accent via-cyan-400 to-green-400"
                        style={{ width: '72%' }}
                      />
                    </div>
                  </div>
                </div>

                {/* ── VOICE WAVE + MIC (center, avatar overlay) ── */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-[45%]">
                  {/* Voice bars */}
                  <div className="mb-3 flex items-end justify-center gap-[2px] sm:mb-4 sm:gap-[3px]">
                    {[6,10,14,18,12,8,6,12,20,16,10,6,8,14,18,10].map((h,i)=>(
                      <span
                        key={i}
                        className="w-[2px] rounded-full bg-indigo-400/80 animate-pulse sm:w-[3px]"
                        style={{
                          height: `${h}px`,
                          animationDelay: `${i * 0.08}s`,
                          opacity: 0.6 + (Math.sin(i * 0.5) * 0.4)
                        }}
                      />
                    ))}
                  </div>

                  {/* Mic button */}
                  <div className="flex justify-center">
                    <button className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 shadow-[0_0_30px_rgba(99,102,241,0.6)] transition-all hover:scale-110 hover:shadow-[0_0_40px_rgba(99,102,241,0.8)] sm:h-14 sm:w-14">
                      <MicIcon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                    </button>
                  </div>
                  <p className="mt-2 text-center text-[10px] font-medium tracking-wider text-white/70 sm:mt-2.5 sm:text-xs">
                    Listening
                  </p>
                </div>

                {/* ── STREAK BADGE (top right, mobile only) ── */}
                <div className="absolute right-3 top-16 sm:hidden">
                  <div className="rounded-xl border border-white/10 bg-black/50 px-2.5 py-1.5 backdrop-blur-xl">
                    <p className="text-[9px] text-white/50">Streak</p>
                    <p className="text-xs font-bold text-orange-400">12&nbsp;Days&nbsp;🔥</p>
                  </div>
                </div>

                {/* ── DESKTOP: Streak badge (right side, mid) ── */}
                <div className="absolute right-4 top-1/2 hidden -translate-y-1/2 sm:block">
                  <div className="rounded-2xl border border-white/10 bg-black/50 px-4 py-3 backdrop-blur-xl">
                    <p className="text-[10px] text-white/50">Current Streak</p>
                    <p className="mt-0.5 text-lg font-bold text-orange-400">12 Days 🔥</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DOMAINS SECTION ── */}
      <section className="border-y border-dojo-border bg-dojo-surface/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-dojo-text-primary sm:text-3xl">Practice in Real-World Scenarios</h2>
          <p className="mt-2 text-center text-sm text-dojo-text-muted sm:text-base">
            Choose a scenario and start your immersive roleplay journey
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {domains.map((domain) => {
              const Icon = domainIconMap[domain.icon];
              return (
                <div
                  key={domain.name}
                  className="group cursor-pointer rounded-xl border border-dojo-border bg-dojo-surface-raised p-4 transition-all hover:border-dojo-accent/50 hover:-translate-y-0.5 sm:p-5"
                >
                  <div className="mb-2 text-dojo-accent sm:mb-3">
                    {Icon && <Icon className="h-6 w-6 sm:h-7 sm:w-7" />}
                  </div>
                  <div className="text-sm font-semibold text-dojo-text-primary sm:text-base">{domain.name}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-dojo-text-muted sm:mt-1.5">{domain.desc}</div>
                  <div className="mt-2 text-[10px] font-medium text-dojo-accent sm:mt-3">{domain.count}</div>
                </div>
              );
            })}

            {/* More Coming Card */}
            <div className="group cursor-pointer rounded-xl border border-dashed border-dojo-border bg-dojo-surface-raised/50 p-4 transition-all hover:border-dojo-accent/30 hover:-translate-y-0.5 sm:p-5">
              <div className="mb-2 text-dojo-text-muted sm:mb-3">
                <MoreComingIcon className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div className="text-sm font-semibold text-dojo-text-primary sm:text-base">More Coming</div>
              <div className="mt-1 text-xs leading-relaxed text-dojo-text-muted sm:mt-1.5">New scenarios added regularly</div>
              <div className="mt-2 text-[10px] font-medium text-dojo-text-muted sm:mt-3">Stay tuned</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ROW ── */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
        <div className="grid grid-cols-2 gap-y-8 gap-x-4 sm:grid-cols-3 lg:grid-cols-6">
          {stats.map((stat) => {
            const Icon = statIconMap[stat.icon];
            return (
              <div key={stat.label} className="flex flex-col items-center text-center">
                <div className="mb-2 text-dojo-accent">
                  {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6" />}
                </div>
                <div className="text-xl font-bold text-dojo-text-primary sm:text-2xl">{stat.value}</div>
                <div className="mt-0.5 text-xs text-dojo-text-muted sm:mt-1">{stat.label}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── BOTTOM CTA BANNER ── */}
      <section className="mx-4 mb-36 max-w-7xl rounded-2xl border border-dojo-accent/30 bg-gradient-to-r from-dojo-accent/20 via-dojo-sidebar to-dojo-accent/10 px-6 py-12 sm:mx-6 sm:px-10 sm:py-14 lg:mx-auto">
        <div className="flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="text-xl font-bold text-dojo-text-primary sm:text-2xl">Ready to Start Your Journey?</h2>
            <p className="mt-2 text-sm text-dojo-text-muted sm:text-base">
              Join thousands of learners improving their speaking skills with AI.
            </p>
          </div>
          <Link
            href="/auth"
            className="whitespace-nowrap rounded-full bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 sm:px-8"
          >
            Start Free Now &rarr;
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-dojo-border py-8 text-center text-xs text-dojo-text-muted sm:text-sm">
        &copy; 2026 AI DOJO &mdash; Immersive Language Role-Play Training
      </footer>
    </div>
  );
}