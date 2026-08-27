import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getAuthUserReadOnly } from '@/lib/auth/server';
import { NavActions } from '@/components/marketing/NavActions';
import { TryoutPanel } from '@/components/marketing/TryoutPanel';
import { Avatar } from '@/components/ui/Avatar';

import {
  MicIcon,
  RestaurantIcon,
  TravelIcon,
  BusinessIcon,
  HealthcareIcon,
  ShoppingIcon,
  EducationIcon,
  DailyLifeIcon,
  UsersIcon,
  ChatIcon,
  GlobeIcon,
  LightningIcon,
  ChartIcon,
  StarIcon,
  ChevronRightIcon,
  XIcon,
  LinkedInIcon,
  InstagramIcon,
  YouTubeIcon,
} from '@/components/Icons';
import { DemoVideoDialog } from '@/components/marketing/DemoVideoDialog';
import { FooterNewsletter } from '@/components/marketing/FooterNewsletter';

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
  { icon: 'Restaurant', name: 'Restaurant', desc: 'Order food, make reservations, and talk with confidence.', count: '20+ Situations', image: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80' },
  { icon: 'Travel', name: 'Travel', desc: 'Ask for directions, book hotels, and navigate with ease.', count: '18+ Situations', image: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80' },
  { icon: 'Business', name: 'Business', desc: 'Lead meetings, pitch ideas, and close deals.', count: '16+ Situations', image: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80' },
  { icon: 'Healthcare', name: 'Healthcare', desc: 'Talk with doctors, pharmacists, and medical staff.', count: '16+ Situations', image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=80' },
  { icon: 'Shopping', name: 'Shopping', desc: 'Ask for help, compare items, and shop like a local.', count: '16+ Situations', image: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&q=80' },
  { icon: 'Education', name: 'Education', desc: 'School life, teachers, and classmates.', count: '12+ Situations', image: 'https://images.unsplash.com/photo-1523050854058-8df90110c7f1?w=800&q=80' },
  { icon: 'Daily Life', name: 'Daily Life', desc: 'Small talk, hobbies, and family.', count: '20+ Situations', image: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80' },
];

const heroFeatures = [
  { icon: 'Globe', label: '30+ languages, 100+ scenarios' },
  { icon: 'Users', label: 'Free to use — no card, no catch' },
  { icon: 'Lightning', label: 'Start your first conversation in under a minute' },
];

const heroIconMap: Record<string, React.FC<{ className?: string }>> = {
  Globe: GlobeIcon,
  Users: UsersIcon,
  Lightning: LightningIcon,
};

const socialLinks = [
  { label: 'X', href: 'https://x.com/aidojo', icon: XIcon },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/aidojo', icon: LinkedInIcon },
  { label: 'Instagram', href: 'https://www.instagram.com/aidojo', icon: InstagramIcon },
  { label: 'YouTube', href: 'https://www.youtube.com/@aidojo', icon: YouTubeIcon },
];

const footerColumns = [
  {
    title: 'Product',
    links: [
      { label: 'Scenarios', href: '#scenarios' },
      { label: 'How It Works', href: '#how' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Try a Demo', href: '/tryout' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Language Tips', href: '/language-tips' },
      { label: 'Help Center', href: '/help' },
      { label: 'Community', href: '/community' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/about' },
      { label: 'Our Mission', href: '/mission' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact Us', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Cookie Policy', href: '/cookies' },
    ],
  },
];

const whyChoose = [
  { icon: 'Users', title: 'Realistic AI Partners', body: 'Talk with AI characters that understand context and respond naturally.' },
  { icon: 'Chat', title: 'Immersive Scenarios', body: 'Practice in real-world situations that mirror daily life.' },
  { icon: 'Lightning', title: 'Instant Feedback', body: 'Get AI feedback on your pronunciation, grammar, and fluency.' },
  { icon: 'Chart', title: 'Track Your Progress', body: 'Earn XP, build streaks, and watch your skills improve over time.' },
  { icon: 'Globe', title: 'Any Language', body: 'Learn 30+ languages with culturally aware AI characters.' },
];

const whyChooseIconMap: Record<string, React.FC<{ className?: string }>> = {
  Users: UsersIcon,
  Chat: ChatIcon,
  Lightning: LightningIcon,
  Chart: ChartIcon,
  Globe: GlobeIcon,
};

const steps = [
  { title: 'Choose a scenario', body: 'Pick a real-world situation and your target language.' },
  { title: 'Talk with AI', body: 'Have natural conversations with your AI partner.' },
  { title: 'Get feedback', body: 'Receive instant feedback and suggestions to improve.' },
  { title: 'Track & improve', body: 'Track your progress and level up your skills.' },
];

const testimonials = [
  { quote: 'AI-Dojo helped me practice Japanese before my trip to Tokyo. The conversations felt so real and boosted my confidence!', name: 'Sarah K.', role: 'Traveler' },
  { quote: 'The feedback on pronunciation is spot on. I can see my progress every day and the scenarios are super practical.', name: 'David M.', role: 'Business Professional' },
  { quote: 'I love how I can practice anytime, anywhere. It’s like having a personal language coach in my pocket.', name: 'Aisha R.', role: 'Student' },
];

// `logo` is optional — partners without a brand asset fall back to an initial badge.
const partners: { name: string; logo?: string }[] = [
  { name: 'AKADEMIA LTD', logo: '/brands/akademia.png' },
  { name: 'IUEA', logo: '/brands/iuea.jpeg' },
  { name: 'MAKERERE', logo: '/brands/makerere.jpeg' },
  { name: 'AI AVATAR' },
  { name: 'AI DOJO', logo: '/brands/ai_dojo.png' },
];

function PartnerBadge({ name, logo }: { name: string; logo?: string }) {
  return (
    <div className="flex shrink-0 items-center gap-4">
      {/* Wider-than-tall tile: the partner assets range from a 4:1 wordmark
          (akademia) to detailed university crests, and a 56px square cropped
          both to illegibility. `bg-white` is deliberate — every logo file is a
          JPEG/PNG with a baked-in white background, so a themed surface behind
          them just framed a white rectangle in dark mode. */}
      <div className="relative flex h-16 w-24 sm:h-20 sm:w-28 items-center justify-center overflow-hidden rounded-xl border border-dojo-border bg-white">
        {logo ? (
          <Image src={logo} alt="" fill sizes="(min-width: 640px) 112px, 96px" className="object-contain p-2" />
        ) : (
          <span className="text-2xl sm:text-3xl font-bold text-dojo-accent">{name.charAt(0)}</span>
        )}
      </div>
      <span className="whitespace-nowrap text-sm sm:text-base font-semibold text-dojo-text-primary">{name}</span>
    </div>
  );
}

const navLinks = ['Scenarios', 'Partners', 'How It Works'];

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
              const href = link === 'Scenarios' ? '#scenarios' : link === 'Partners' ? '#partners' : '#how';
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
        {/* Faint kanji watermark */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 top-0 select-none font-display text-[26rem] leading-none text-dojo-text-primary/[0.04]"
        >
          道
        </div>

        {/* Ink-wash pagoda illustration, bottom-left */}
        <img
          src="/landing/house.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 hidden w-56 select-none opacity-70 sm:block lg:w-72"
        />

        <div className="relative mx-auto max-w-7xl px-4 pt-16 pb-16 sm:px-6 sm:pt-20 sm:pb-20 lg:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* LEFT COLUMN */}
            <div className="order-1 lg:order-1">
              <p className="animate-arena-rise text-xs font-bold uppercase tracking-[0.2em] text-dojo-accent">
                Practice. Speak. Progress.
              </p>

              <h1 className="animate-arena-rise arena-delay-1 mt-4 font-display text-5xl font-bold leading-none tracking-tight text-dojo-text-primary sm:text-6xl lg:text-7xl">
                AI&#8209;DOJO
              </h1>

              <p className="animate-arena-rise arena-delay-2 mt-4 max-w-xl font-display text-xl italic leading-snug text-dojo-text-muted sm:text-2xl">
                Before you step onto the mat, let us show you who you are.
              </p>

              <p className="animate-arena-rise arena-delay-2 mt-5 max-w-xl text-base leading-relaxed text-dojo-text-muted sm:text-lg">
                Step into real-world conversations with AI characters. Practice any language in
                immersive roleplay scenarios and get better&mdash;faster.
              </p>

              <div className="animate-arena-rise arena-delay-3 mt-7 space-y-2.5">
                {heroFeatures.map((item) => {
                  const Icon = heroIconMap[item.icon];
                  return (
                    <div key={item.label} className="flex items-center gap-2.5 text-sm text-dojo-text-muted">
                      {Icon && <Icon className="h-4 w-4 shrink-0 text-dojo-accent" />}
                      {item.label}
                    </div>
                  );
                })}
              </div>

              <div className="animate-arena-rise arena-delay-3 mt-8 flex flex-wrap items-center gap-3 sm:mt-9 sm:gap-5">
                <Link
                  href="/auth"
                  className="rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent sm:px-7"
                >
                  Start Free Now
                </Link>
                <Link
                  href="#scenarios"
                  className="text-sm font-semibold text-dojo-text-primary underline decoration-dojo-accent decoration-2 underline-offset-4 transition-colors hover:text-dojo-accent"
                >
                  Explore Scenarios
                </Link>
                <DemoVideoDialog />
              </div>
            </div>

            {/* RIGHT COLUMN — Live session demo card, framed as a broadcast */}
            <div className="animate-arena-rise arena-delay-2 order-2 w-full lg:order-2">
              <div className="relative overflow-hidden rounded-2xl border border-dojo-border bg-dojo-surface-raised shadow-[0_24px_80px_-24px_rgba(193,57,43,0.35)] sm:rounded-3xl">
                {/* Scoreboard header bar */}
                <div className="relative z-20 flex items-center justify-between gap-3 border-b border-white/10 bg-black/55 px-3 py-2.5 backdrop-blur-xl sm:px-5 sm:py-3">
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
                            className="h-full rounded-full bg-gradient-to-r from-dojo-accent to-orange-300"
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
                          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-dojo-accent shadow-[0_0_24px_rgba(193,57,43,0.55)] sm:h-14 sm:w-14"
                        >
                          <MicIcon className="h-5 w-5 text-white sm:h-6 sm:w-6" />
                        </span>

                        {/* Voice bars */}
                        <div className="flex h-12 items-center gap-0.5 sm:h-14 sm:gap-1">
                          {[6,10,14,18,12,8,6,12,20,16,10,6,8,14,18,10].map((h,i)=>(
                            <span
                              key={i}
                              className="w-0.5 animate-pulse rounded-full bg-orange-300/90 sm:w-1"
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

          {/* ── TRY IT OUT PANEL ── */}
          <div className="animate-arena-rise arena-delay-3 mt-10 sm:mt-12">
            <TryoutPanel />
          </div>

          {/* ── TRUSTED BY STRIP ── */}
          <div className="animate-arena-rise arena-delay-4 mt-12 border-t border-dojo-border pt-8 sm:mt-14">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-dojo-text-muted">
              Trusted by learners &amp; teams worldwide
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
              {partners.map(({ name }) => (
                <span key={name} className="text-sm font-semibold tracking-wide text-dojo-text-muted">
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── WHY LEARNERS CHOOSE AI-DOJO ── */}
      <section className="border-y border-dojo-border bg-dojo-surface/40 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-dojo-accent">
            Why Learners Choose AI-Dojo
          </p>
          <h2 className="mt-3 text-center font-display text-2xl font-bold text-dojo-text-primary sm:text-3xl">
            Real conversations. Real progress.
          </h2>

          <div className="mt-10 grid grid-cols-2 gap-8 sm:mt-12 sm:grid-cols-3 lg:grid-cols-5">
            {whyChoose.map((item) => {
              const Icon = whyChooseIconMap[item.icon];
              return (
                <div key={item.title} className="flex flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-dojo-accent-soft text-dojo-accent">
                    {Icon && <Icon className="h-6 w-6" />}
                  </div>
                  <h3 className="mt-4 text-sm font-bold text-dojo-text-primary">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-dojo-text-muted">{item.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── SCENARIOS ── */}
      <section id="scenarios" className="scroll-mt-16 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-dojo-accent">Explore Popular Scenarios</p>
              <h2 className="mt-3 font-display text-2xl font-bold text-dojo-text-primary sm:text-3xl">
                Practice what matters to you
              </h2>
            </div>
            <Link
              href="/auth"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-dojo-border px-5 py-2.5 text-sm font-semibold text-dojo-text-primary transition-colors hover:border-dojo-accent/50 hover:text-dojo-accent"
            >
              View all scenarios
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 sm:mt-12 sm:grid-cols-3 lg:grid-cols-5">
            {domains.slice(0, 5).map((domain) => {
              const Icon = domainIconMap[domain.icon];
              return (
                <div
                  key={domain.name}
                  className="group overflow-hidden rounded-2xl border border-dojo-border bg-dojo-surface-raised transition-colors hover:border-dojo-accent/50"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={domain.image}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-dojo-accent text-white shadow-md">
                      {Icon && <Icon className="h-4 w-4" />}
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="text-sm font-bold text-dojo-text-primary">{domain.name}</div>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-dojo-text-muted">{domain.desc}</p>
                    <div className="mt-3 text-xs font-semibold text-dojo-accent">{domain.count} &rarr;</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="scroll-mt-16 relative overflow-hidden border-y border-dojo-border bg-dojo-surface/40 py-16 sm:py-20">
        <img
          src="/landing/banboo.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 bottom-0 hidden w-72 select-none opacity-80 lg:block xl:w-80"
        />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-dojo-accent">How It Works</p>
          <h2 className="mt-3 text-center font-display text-2xl font-bold text-dojo-text-primary sm:text-3xl">
            Simple steps to fluency
          </h2>

          <div className="relative mt-12 grid grid-cols-2 gap-y-10 sm:mt-14 lg:grid-cols-4 lg:gap-y-0">
            <div
              aria-hidden="true"
              className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-dojo-border lg:block"
            />
            {steps.map((step, index) => (
              <div key={step.title} className="relative flex flex-col items-center px-2 text-center">
                <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-dojo-border bg-dojo-surface-raised font-display text-lg font-bold text-dojo-accent">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-sm font-bold text-dojo-text-primary">{step.title}</h3>
                <p className="mt-2 max-w-[14rem] text-xs leading-relaxed text-dojo-text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-dojo-accent">Loved by Learners</p>
              <h2 className="mt-3 font-display text-2xl font-bold text-dojo-text-primary sm:text-3xl">
                Hear from our community
              </h2>
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-3 sm:gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-dojo-border bg-dojo-surface-raised p-6">
                <div className="flex gap-0.5 text-dojo-warning">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <StarIcon key={i} className="h-4 w-4" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-dojo-text-primary">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3">
                  <Avatar name={t.name} size="sm" />
                  <div>
                    <div className="text-sm font-semibold text-dojo-text-primary">{t.name}</div>
                    <div className="text-xs text-dojo-text-muted">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PARTNERS SECTION ── */}
      <section id="partners" className="scroll-mt-16 border-y border-dojo-border bg-dojo-surface/40 py-16 sm:py-20 overflow-hidden">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center font-display text-2xl font-bold text-dojo-text-primary sm:text-3xl">Our Partners</h2>
          <p className="mt-3 text-center text-sm text-dojo-text-muted sm:text-base">
            Trusted by leading institutions and innovators
          </p>

          <div className="mt-10 relative">
            <div className="flex overflow-hidden">
              <div className="flex animate-marquee gap-16 sm:gap-24 items-center">
                {partners.map((partner) => (
                  <PartnerBadge key={partner.name} name={partner.name} logo={partner.logo} />
                ))}
                <div aria-hidden="true" className="flex gap-16 sm:gap-24">{partners.map((partner) => (
                  <PartnerBadge key={`${partner.name}-dup`} name={partner.name} logo={partner.logo} />
                ))}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BOTTOM CTA BANNER ── */}
      <section id="cta" className="scroll-mt-16 relative mx-4 my-16 max-w-7xl overflow-hidden rounded-2xl border border-dojo-accent/30 bg-dojo-surface-raised shadow-[0_24px_80px_-32px_rgba(193,57,43,0.35)] sm:mx-6 lg:mx-auto sm:my-20">
        <img
          src="/landing/dojo-gate.png"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-6 left-0 hidden w-48 select-none opacity-90 sm:block lg:w-60"
        />

        <div className="relative flex flex-col items-center justify-between gap-6 px-6 py-12 text-center sm:flex-row sm:px-10 sm:py-14 sm:text-left sm:pl-56 lg:pl-64">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-8 -top-8 select-none font-display text-9xl leading-none text-dojo-accent/10"
          >
            道
          </div>
          <div className="relative">
            <h2 className="font-display text-xl font-bold text-dojo-text-primary sm:text-2xl">Ready to start your journey?</h2>
            <p className="mt-2 text-sm text-dojo-text-muted sm:text-base">
              Join thousands of learners improving their speaking skills with AI-Dojo.
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-dojo-text-muted sm:justify-start">
              <span>Free to start</span>
              <span>No credit card</span>
              <span>Start in under a minute</span>
            </div>
          </div>
          <Link
            href="/auth"
            className="relative inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-dojo-accent px-6 py-3 font-semibold text-white transition-all hover:bg-dojo-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent sm:px-8"
          >
            Get Started Free
            <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-dojo-border bg-dojo-surface/60">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
            {/* Brand + social */}
            <div className="sm:col-span-2 lg:col-span-1">
              <Link href="/" className="inline-flex items-center gap-2.5 text-lg font-bold text-dojo-text-primary">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-dojo-accent font-display text-sm text-white">
                  道
                </span>
                <span>AI-Dojo</span>
              </Link>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-dojo-text-muted">
                Immersive AI role-play training to help you speak any language confidently in the real world.
              </p>
              <ul className="mt-6 flex items-center gap-3">
                {socialLinks.map((social) => {
                  const Icon = social.icon;
                  return (
                    <li key={social.label}>
                      <a
                        href={social.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={social.label}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-dojo-border text-dojo-text-muted transition-colors hover:border-dojo-accent/50 hover:text-dojo-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dojo-accent"
                      >
                        <Icon className="h-4 w-4" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>

            {footerColumns.map((column) => (
              <div key={column.title}>
                <h3 className="text-sm font-semibold text-dojo-text-primary">{column.title}</h3>
                <ul className="mt-4 space-y-3">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-dojo-text-muted transition-colors hover:text-dojo-accent"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <FooterNewsletter />
          </div>

          <div className="mt-10 flex flex-col items-center gap-3 border-t border-dojo-border pt-6 text-xs text-dojo-text-muted sm:flex-row sm:justify-between sm:text-sm">
            <p>&copy; {new Date().getFullYear()} AI-Dojo. All rights reserved.</p>
            <p className="inline-flex items-center gap-2">
              Made with
              <span className="flex h-5 w-5 items-center justify-center rounded bg-dojo-accent font-display text-[0.625rem] text-white">
                道
              </span>
              in Tokyo
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
