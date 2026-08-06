import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { NavActions } from '@/components/marketing/NavActions';

import {
  MicIcon,
  RestaurantIcon,
  TravelIcon,
  BusinessIcon,
  HealthcareIcon,
  ShoppingIcon,
  EducationIcon,
  DailyLifeIcon,
  MoreComingIcon,
  CheckmarkIcon,
  ClockIcon,
  GlobeIcon,
  ScenariosIcon,
  LightningIcon,
  ChartIcon,
  StarIcon,
  ChevronRightIcon,
} from '@/components/Icons';
import { DemoVideoDialog } from '@/components/marketing/DemoVideoDialog';

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
  { icon: 'Restaurant', name: 'Restaurant', you: 'Guest', ai: 'Server', desc: 'Practice ordering food, making reservations...', count: '20+ Situations', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80', gradientFrom: '#D14343', gradientTo: '#7A1F1F' },
  { icon: 'Travel', name: 'Travel', you: 'Traveler', ai: 'Desk Clerk', desc: 'Airports, hotels, directions...', count: '18+ Situations', image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80', gradientFrom: '#06B6D4', gradientTo: '#035B6B' },
  { icon: 'Business', name: 'Business', you: 'Professional', ai: 'Client', desc: 'Meetings, presentations, negotiations...', count: '16+ Situations', image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80', gradientFrom: '#2563EB', gradientTo: '#0F337A' },
  { icon: 'Healthcare', name: 'Healthcare', you: 'Patient', ai: 'Doctor', desc: 'Doctor visits, pharmacy, emergencies...', count: '16+ Situations', image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=80', gradientFrom: '#E3A939', gradientTo: '#7A5715' },
  { icon: 'Shopping', name: 'Shopping', you: 'Shopper', ai: 'Clerk', desc: 'Ask for help, compare items...', count: '16+ Situations', image: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&q=80', gradientFrom: '#9333EA', gradientTo: '#4A117A' },
  { icon: 'Education', name: 'Education', you: 'Student', ai: 'Teacher', desc: 'School life, teachers, classmates...', count: '12+ Situations', image: 'https://images.unsplash.com/photo-1523050854058-8df90110c7f1?w=800&q=80', gradientFrom: '#2FAE66', gradientTo: '#145A33' },
  { icon: 'Daily Life', name: 'Daily Life', you: 'Neighbor', ai: 'Friend', desc: 'Small talks, hobbies, family...', count: '20+ Situations', image: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80', gradientFrom: '#F59E0B', gradientTo: '#7A4F06' },
];

const stats = [
  { icon: 'Checkmark', value: '98%', label: 'Satisfaction Rate' },
  { icon: 'Clock', value: '24/7', label: 'AI Support' },
  { icon: 'Globe', value: '20+', label: 'Languages Supported' },
  { icon: 'Scenarios', value: '8+', label: 'Realistic Scenarios' },
];

const statIconMap: Record<string, React.FC<{ className?: string }>> = {
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

const rounds = [
  {
    icon: 'Mic',
    title: 'You Speak',
    body: 'Step into a real-world scenario and talk to your AI character — by voice or by chat. The character answers in character, and the scene keeps moving.',
  },
  {
    icon: 'Chart',
    title: 'You Get Scored',
    body: 'Accuracy, vocabulary, fluency, and cultural fit are scored against the scene, with instant feedback on every line you deliver.',
  },
  {
    icon: 'Lightning',
    title: 'You Level Up',
    body: 'Review your session report, track progress across domains, and come back for the next match. Confidence compounds every session.',
  },
];

const roundIconMap: Record<string, React.FC<{ className?: string }>> = {
  Mic: MicIcon,
  Chart: ChartIcon,
  Lightning: LightningIcon,
};

const navLinks = ['Scenarios', 'Partners', 'Get Started'];

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
          <Link
            href="/"
            className="flex items-center gap-2.5 text-lg font-bold text-dojo-text-primary sm:text-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent rounded-md"
          >
            <span>🥋 AI DOJO</span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map((link) => {
              const href = link === 'Scenarios' ? '#scenarios' : link === 'Partners' ? '#partners' : '#cta';
              return (
                <Link
                  key={link}
                  href={href}
                  className="text-sm font-medium text-dojo-text-muted transition-colors hover:text-dojo-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent rounded-md"
                >
                  {link}
                </Link>
              );
            })}
          </div>

          <NavActions />
        </div>
      </nav>

      {/* ── HERO SECTION ── */}
      <section className="relative overflow-hidden">
        {/* Ambient arena glow */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 flex justify-center">
          <div className="h-[34rem] w-[60rem] rounded-full bg-dojo-accent/15 blur-[120px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-16 sm:px-6 sm:pt-20 sm:pb-20 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* LEFT COLUMN */}
            <div className="order-1 lg:order-1">
              <h1 className="animate-arena-rise text-3xl font-bold leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl xl:text-6xl">
                <span className="block text-dojo-text-primary">Speak Any Language</span>
                <span className="block text-dojo-text-primary">As If You Were</span>
                <span className="block decoration-dojo-accent decoration-4 underline underline-offset-4">
                  Really There
                </span>
              </h1>

              <p className="animate-arena-rise arena-delay-1 mt-5 max-w-xl text-base leading-relaxed text-dojo-text-muted sm:text-lg">
                Practice real-world conversations with AI characters in immersive scenarios.
                Get instant feedback and improve faster through roleplay.
              </p>

              <div className="animate-arena-rise arena-delay-2 mt-8 flex flex-wrap items-center gap-3 sm:mt-10 sm:gap-4">
                <Link
                  href="/auth"
                  className="rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-7"
                >
                  Start Free &mdash; No Card
                </Link>
                <DemoVideoDialog />
              </div>

              <div className="animate-arena-rise arena-delay-3 mt-7 flex flex-wrap gap-x-6 gap-y-3 sm:mt-8">
                {features.map((pill) => {
                  const Icon = featureIconMap[pill.icon];
                  return (
                    <div key={pill.label} className="flex items-center gap-2 text-sm text-dojo-text-muted">
                      {Icon && <Icon className="h-4 w-4 text-dojo-accent" />}
                      {pill.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN — Live session demo card, framed as a broadcast */}
            <div className="animate-arena-rise arena-delay-2 order-2 w-full lg:order-2">
              <div className="relative overflow-hidden rounded-2xl border border-dojo-border bg-dojo-surface-raised shadow-[0_24px_80px_-24px_rgba(45,59,197,0.35)] sm:rounded-3xl">
                {/* Scoreboard header bar */}
                <div className="relative z-20 flex items-center justify-between gap-3 border-b border-dojo-border bg-dojo-canvas/70 px-3 py-2.5 backdrop-blur-xl sm:px-5 sm:py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white sm:text-xs">Live</span>
                    <span className="hidden text-white/40 sm:inline">·</span>
                    <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/80 sm:text-xs">
                      Restaurant
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-medium tabular-nums text-white/70 sm:text-xs">
                    <span className="hidden sm:inline">Session 04</span>
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono">03:42</span>
                  </div>
                </div>

                <div className="relative aspect-[16/10] overflow-hidden sm:aspect-[16/11]">
                  {/* Restaurant backdrop photo */}
                  <Image
                    src="/restaurant.png"
                    alt=""
                    fill
                    sizes="(max-width: 63.99rem) 100vw, 50vw"
                    className="object-cover"
                    priority
                  />
                  {/* Dark overlay so foreground UI stays legible over the photo */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/35 to-black/70" />

                  {/* ── CONVERSATION BUBBLE (left side) ── */}
                  <div className="absolute left-3 top-12 max-w-[150px] rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-xl sm:left-6 sm:top-16 sm:max-w-[180px] sm:p-4">
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
                        sizes="(max-width: 63.99rem) 100vw, 50vw"
                        className="object-contain object-bottom drop-shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
                        priority
                      />
                    </div>
                  </div>

                  {/* ── BOTTOM OVERLAY (progress bar + mic) ── */}
                  <div className="absolute bottom-0 left-0 right-0 flex items-end gap-3 px-3 pb-3 sm:px-5 sm:pb-4">
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl border border-white/10 bg-black/60 px-3.5 py-3 backdrop-blur-xl sm:px-4 sm:py-3.5">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[10px] text-white/50 sm:text-xs">Conversation Progress</span>
                          <span className="text-xs font-semibold tabular-nums text-white sm:text-sm">72%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/10 sm:h-2.5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-dojo-accent to-indigo-300"
                            style={{ width: '72%' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ── MIC + VOICE WAVE ── */}
                    <div className="shrink-0">
                      <div className="flex items-center gap-3 sm:gap-4">
                        {/* Mic button (decorative) */}
                        <span
                          aria-hidden="true"
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-dojo-accent shadow-[0_0_24px_rgba(45,59,197,0.55)] sm:h-14 sm:w-14"
                        >
                          <MicIcon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                        </span>

                        {/* Voice bars */}
                        <div className="flex h-12 items-center gap-0.5 sm:h-14 sm:gap-1">
                          {[6,10,14,18,12,8,6,12,20,16,10,6,8,14,18,10].map((h,i)=>(
                            <span
                              key={i}
                              className="w-0.5 animate-pulse rounded-full bg-indigo-300/90 sm:w-1"
                              style={{
                                height: `${h}px`,
                                animationDelay: `${i * 0.08}s`,
                                opacity: 0.6 + (Math.sin(i * 0.5) * 0.4)
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="mt-2 text-left text-[10px] font-medium tracking-wider text-white/70 sm:mt-2.5 sm:text-xs">
                        Listening...
                      </p>
                    </div>
                  </div>

                  {/* ── SESSION XP + STREAK (grouped, right side) ── */}
                  <div className="absolute right-3 top-12 flex flex-col gap-2 sm:right-5 sm:top-16 sm:gap-2.5">
                    <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-xl sm:rounded-2xl sm:px-4 sm:py-2.5">
                      <p className="text-[9px] text-white/50 sm:text-[10px]">Session XP</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs font-bold text-amber-400 sm:text-sm">
                        <StarIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        +120 XP
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/50 px-3 py-2 backdrop-blur-xl sm:rounded-2xl sm:px-4 sm:py-2.5">
                      <p className="text-[9px] text-white/50 sm:text-[10px]">Current Streak</p>
                      <p className="mt-0.5 text-xs font-bold text-orange-400 sm:text-sm">12 Days</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SCOREBOARD — STATS ROW ── */}
      <section aria-label="AI DOJO by the numbers" className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 sm:pb-20">
        <div className="overflow-hidden rounded-2xl border border-dojo-border bg-dojo-surface-raised">
          <div className="grid grid-cols-2 gap-px bg-dojo-border sm:grid-cols-4">
            {stats.map((stat) => {
              const Icon = statIconMap[stat.icon];
              return (
                <div key={stat.label} className="flex flex-col items-center justify-center gap-2 bg-dojo-canvas px-4 py-8 text-center sm:py-10">
                  <div className="text-dojo-accent">
                    {Icon && <Icon className="h-5 w-5 sm:h-6 sm:w-6" />}
                  </div>
                  <div className="text-xl font-bold tabular-nums text-dojo-text-primary sm:text-2xl">{stat.value}</div>
                  <div className="text-xs text-dojo-text-muted sm:text-sm">{stat.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SCENARIOS — MATCH CARDS ── */}
      <section id="scenarios" className="scroll-mt-16 border-y border-dojo-border bg-dojo-surface/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-dojo-text-primary sm:text-3xl">Pick Your Arena</h2>
            <p className="mt-3 text-sm text-dojo-text-muted sm:text-base">
              Eight real-world domains, each with a dozen-plus situations. Choose your match and step in.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:mt-12 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {domains.map((domain) => {
              const Icon = domainIconMap[domain.icon];
              return (
                <div
                  key={domain.name}
                  className="group relative overflow-hidden rounded-xl border border-dojo-border bg-dojo-surface-raised p-4 transition-colors hover:border-dojo-accent/50 sm:p-5"
                >
                  {/* Background Image */}
                  <div className="absolute inset-0 -z-0">
                    <img
                      src={domain.image}
                      alt=""
                      className="h-full w-full object-cover opacity-50 transition-all duration-500 group-hover:scale-110 group-hover:opacity-60"
                      loading="lazy"
                    />
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(135deg, ${domain.gradientFrom}dd, ${domain.gradientTo}ee)`,
                      }}
                    />
                  </div>
                  <div className="relative z-10">
                    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 sm:h-12 sm:w-12">
                      {Icon && <Icon className="h-5 w-5 text-white sm:h-6 sm:w-6" />}
                    </div>
                    <div className="text-sm font-semibold text-white sm:text-base">{domain.name}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-relaxed text-white/80 sm:mt-1.5">{domain.desc}</div>
                    <div className="mt-2 text-[10px] font-medium text-white/60 sm:mt-3">{domain.count}</div>

                    {/* Matchup lineup */}
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/15 pt-2.5">
                      <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/90">
                        You &middot; {domain.you}
                      </span>
                      <span className="shrink-0 text-[10px] font-bold text-white/40">VS</span>
                      <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-white/90">
                        {domain.ai} &middot; AI
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* More Coming Card */}
            <div className="group rounded-xl border border-dashed border-dojo-border bg-dojo-surface-raised/50 p-4 transition-colors hover:border-dojo-accent/30 sm:p-5">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-500/15 sm:h-12 sm:w-12">
                <MoreComingIcon className="h-5 w-5 text-gray-400 sm:h-6 sm:w-6" />
              </div>
              <div className="text-sm font-semibold text-dojo-text-primary sm:text-base">More Coming</div>
              <div className="mt-1 text-xs leading-relaxed text-dojo-text-muted sm:mt-1.5">New scenarios added regularly</div>
              <div className="mt-2 text-[10px] font-medium text-dojo-text-muted sm:mt-3">Stay tuned</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS — THREE ROUNDS ── */}
      <section id="how" className="scroll-mt-16 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold text-dojo-text-primary sm:text-3xl">Every Session Is a Match</h2>
            <p className="mt-3 text-sm text-dojo-text-muted sm:text-base">
              Three rounds, one loop: you speak, the arena scores you, you level up.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3 sm:gap-6">
            {rounds.map((round, index) => {
              const Icon = roundIconMap[round.icon];
              return (
                <div key={round.title} className="rounded-2xl border border-dojo-border bg-dojo-surface-raised p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full border border-dojo-border bg-dojo-surface px-3 py-1 text-xs font-bold uppercase tracking-widest text-dojo-text-primary">
                      Round {index + 1}
                    </span>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-dojo-accent-soft text-dojo-accent">
                      {Icon && <Icon className="h-5 w-5" />}
                    </div>
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-dojo-text-primary sm:text-xl">{round.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-dojo-text-muted">{round.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PARTNERS SECTION ── */}
      <section id="partners" className="scroll-mt-16 border-y border-dojo-border bg-dojo-surface/40 py-16 sm:py-20 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold text-dojo-text-primary sm:text-3xl">Our Partners</h2>
          <p className="mt-3 text-center text-sm text-dojo-text-muted sm:text-base">
            Trusted by leading institutions and innovators
          </p>

          <div className="mt-10 relative">
            <div className="flex overflow-hidden">
              <div className="flex animate-marquee gap-16 sm:gap-24 items-center">
                {['AKADEMIA LTD', 'IUEA', 'MAKERERE', 'AI AVATAR', 'AI DOJO'].map((name) => (
                  <div key={name} className="flex shrink-0 items-center gap-3">
                    <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl border border-dojo-border bg-dojo-surface-raised">
                      <span className="text-lg sm:text-xl font-bold text-dojo-accent">{name.charAt(0)}</span>
                    </div>
                    <span className="whitespace-nowrap text-sm sm:text-base font-semibold text-dojo-text-primary">{name}</span>
                  </div>
                ))}
                <div aria-hidden="true" className="flex gap-16 sm:gap-24">{['AKADEMIA LTD', 'IUEA', 'MAKERERE', 'AI AVATAR', 'AI DOJO'].map((name) => (
                  <div key={`${name}-dup`} className="flex shrink-0 items-center gap-3">
                    <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-xl border border-dojo-border bg-dojo-surface-raised">
                      <span className="text-lg sm:text-xl font-bold text-dojo-accent">{name.charAt(0)}</span>
                    </div>
                    <span className="whitespace-nowrap text-sm sm:text-base font-semibold text-dojo-text-primary">{name}</span>
                  </div>
                ))}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA BANNER ── */}
      <section id="cta" className="scroll-mt-16 mx-4 my-16 max-w-7xl rounded-2xl border border-dojo-accent/30 bg-dojo-surface-raised px-6 py-12 shadow-[0_24px_80px_-32px_rgba(45,59,197,0.45)] sm:mx-6 sm:px-10 sm:py-14 lg:mx-auto sm:my-20">
        <div className="flex flex-col items-center justify-between gap-6 text-center sm:flex-row sm:text-left">
          <div>
            <h2 className="text-xl font-bold text-dojo-text-primary sm:text-2xl">Your Match Is Waiting</h2>
            <p className="mt-2 text-sm text-dojo-text-muted sm:text-base">
              Join learners improving their speaking skills with AI. Step into the arena &mdash; free.
            </p>
          </div>
          <Link
            href="/auth"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:px-8"
          >
            Start Free Now
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-dojo-border bg-dojo-surface/60">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-bold text-dojo-text-primary">
                <span>🥋 AI DOJO</span>
              </Link>
              <p className="mt-3 text-sm leading-relaxed text-dojo-text-muted max-w-xs">
                Immersive language role-play training powered by AI. Practice real-world conversations and improve faster.
              </p>
            </div>

            {/* Product */}
            <div>
              <h3 className="text-sm font-semibold text-dojo-text-primary">Product</h3>
              <ul className="mt-4 space-y-3">
                <li><Link href="#scenarios" className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent">Scenarios</Link></li>
                <li><Link href="#partners" className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent">Partners</Link></li>
                <li><Link href="/auth" className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent">Get Started</Link></li>
              </ul>
            </div>

            {/* Company */}
            <div>
              <h3 className="text-sm font-semibold text-dojo-text-primary">Company</h3>
              <ul className="mt-4 space-y-3">
                <li>
                  <a
                    href="https://www.akademia.co.jp/en"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent"
                  >
                    AKADEMIA LTD
                    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </li>
                <li><a href="https://iuea.ac.ug" target="_blank" rel="noopener noreferrer" className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent">IUEA</a></li>
                <li><a href="https://www.mak.ac.ug" target="_blank" rel="noopener noreferrer" className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent">Makerere University</a></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h3 className="text-sm font-semibold text-dojo-text-primary">Legal</h3>
              <ul className="mt-4 space-y-3">
                <li><a href="/privacy" className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent">Privacy Policy</a></li>
                <li><a href="/terms" className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent">Terms of Service</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-dojo-border pt-6 text-center text-xs text-dojo-text-muted sm:text-sm">
            &copy; {new Date().getFullYear()} AI DOJO &mdash; Immersive Language Role-Play Training. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
