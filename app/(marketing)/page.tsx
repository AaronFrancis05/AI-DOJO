import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUserReadOnly } from '@/lib/auth/server';

export default async function LandingPage() {
  const user = await getAuthUserReadOnly();

  if (user) {
    redirect('/home');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-gradient-to-b from-[#0B1120] via-[#111D33] to-[#0B1120]">
      {/* Nav */}
      <header className="border-b border-[#1C2A42]">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-xl font-bold text-[#F4F4F8]">
            <span className="text-2xl">🥋</span>
            AI DOJO
          </span>
          <Link
            href="/auth"
            className="rounded-lg bg-[#2D3BC5] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3A4ADB]"
          >
            Get Started
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section — with Avatar conversation mockup */}
        <section className="mx-auto max-w-7xl px-6 pt-20 pb-16">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left: Text */}
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2D3BC5]/30 bg-[#2D3BC5]/10 px-4 py-1.5">
                <span className="h-2 w-2 rounded-full bg-[#2FAE66] animate-pulse" />
                <span className="text-xs font-medium text-[#8A93A8]">AI-Powered Language Learning</span>
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-[#F4F4F8] sm:text-5xl lg:text-6xl">
                Master Japanese Through
                <span className="block mt-2 bg-gradient-to-r from-[#2D3BC5] to-[#2FAE66] bg-clip-text text-transparent">
                  AI Role-Play
                </span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#8A93A8]">
                Practice real-world Japanese conversations with AI characters who adapt to your level.
                Choose from 8 domains — restaurant, business, travel, healthcare, and more.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <Link
                  href="/auth"
                  className="rounded-lg bg-[#2D3BC5] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#3A4ADB]"
                >
                  Start Training — It&apos;s Free
                </Link>
                <Link
                  href="/auth"
                  className="rounded-lg border border-[#1C2A42] px-7 py-3 text-sm font-semibold text-[#8A93A8] transition hover:border-[#2D3BC5] hover:text-[#F4F4F8]"
                >
                  Learn More
                </Link>
              </div>
            </div>

            {/* Right: Conversation mockup */}
            <div className="relative">
              {/* Floating badge */}
              <div className="absolute -top-4 -right-2 z-10 rounded-full border border-[#2FAE66]/30 bg-[#2FAE66]/10 px-4 py-1.5 backdrop-blur-sm">
                <span className="text-xs font-medium text-[#2FAE66]">Live Session</span>
              </div>

              {/* Mock chat bubbles */}
              <div className="space-y-5 rounded-2xl border border-[#1C2A42] bg-[#111D33]/80 p-6 backdrop-blur-sm">
                {/* AI message */}
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D14343] text-sm font-bold text-white">
                    Y
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-[#1C2A42] bg-[#0B1120] px-4 py-3">
                    <p className="text-sm font-medium text-[#F4F4F8]">
                      いらっしゃいませ！ご注文はお決まりですか？
                    </p>
                    <p className="mt-1 text-xs text-[#8A93A8] italic">
                      Irasshaimase! Go-chuumon wa o-kimari desu ka?
                    </p>
                    <p className="text-xs text-[#6B7280] italic">
                      Welcome! Have you decided your order?
                    </p>
                    <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-[#6B7280]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#2FAE66]" />
                      friendly · slight bow
                    </span>
                  </div>
                </div>

                {/* User message */}
                <div className="flex items-start gap-3 flex-row-reverse">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2D3BC5] text-sm font-bold text-white">
                    A
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-br-none bg-[#2D3BC5] px-4 py-3">
                    <p className="text-sm font-medium text-white">
                      はい、ラーメンをください。
                    </p>
                    <p className="mt-1 text-xs text-white/70 italic">
                      Hai, raamen o kudasai.
                    </p>
                    <p className="text-xs text-white/60 italic">
                      Yes, ramen please.
                    </p>
                  </div>
                </div>

                {/* AI reply */}
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D14343] text-sm font-bold text-white">
                    Y
                  </div>
                  <div className="max-w-[80%] rounded-2xl rounded-tl-none border border-[#1C2A42] bg-[#0B1120] px-4 py-3">
                    <p className="text-sm font-medium text-[#F4F4F8]">
                      かしこまりました。お飲み物はいかがですか？
                    </p>
                    <p className="mt-1 text-xs text-[#8A93A8] italic">
                      Kashikomarimashita. O-nomimono wa ikaga desu ka?
                    </p>
                    <p className="text-xs text-[#6B7280] italic">
                      Certainly. Would you like something to drink?
                    </p>
                  </div>
                </div>

                {/* Teaching tip */}
                <div className="rounded-xl border border-[#E3A939]/30 bg-[#E3A939]/10 px-4 py-3">
                  <p className="text-xs text-[#E3A939]">
                    <span className="font-bold">💡 Language Tip:</span> &quot;を&quot; (o) marks the object of an action.
                    &quot;ラーメンを&quot; = ramen (object) + particle.
                  </p>
                </div>
              </div>

              {/* Input mockup */}
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#1C2A42] bg-[#0B1120] px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#1C2A42] text-[#6B7280]">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div className="flex-1 text-sm text-[#6B7280]">Type your response in Japanese...</div>
                <div className="rounded-lg bg-[#2D3BC5] px-4 py-2 text-xs font-semibold text-white">
                  Send
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats bar */}
        <section className="border-y border-[#1C2A42] bg-[#111D33]/50">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
              {[
                { value: '8+', label: 'Real-World Domains' },
                { value: '40+', label: 'Scenarios' },
                { value: '20+', label: 'AI Characters' },
                { value: '95%', label: 'User Satisfaction' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-3xl font-bold text-[#F4F4F8]">{stat.value}</p>
                  <p className="mt-1 text-sm text-[#8A93A8]">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-7xl px-6 py-20">
          <h2 className="text-center text-3xl font-bold text-[#F4F4F8]">
            How It Works
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[#8A93A8]">
            Three simple steps to start speaking Japanese with confidence
          </p>
          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {[
              { step: '01', icon: '🎭', title: 'Choose a Scenario', desc: 'Pick from 40+ real-life situations across 8 domains — restaurant, business, healthcare, travel, and more.' },
              { step: '02', icon: '💬', title: 'Have a Conversation', desc: 'Speak naturally with an AI character. Get real-time feedback on grammar, word choice, and politeness.' },
              { step: '03', icon: '📊', title: 'Track Your Progress', desc: 'Receive detailed evaluations on vocabulary, grammar, fluency, cultural fit, and task completion.' },
            ].map((item) => (
              <div key={item.step} className="group relative rounded-2xl border border-[#1C2A42] bg-[#111D33] p-8 transition hover:border-[#2D3BC5]/50">
                <span className="text-[10px] font-bold tracking-widest text-[#2D3BC5]">{item.step}</span>
                <div className="mt-4 text-3xl">{item.icon}</div>
                <h3 className="mt-4 text-lg font-semibold text-[#F4F4F8]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#8A93A8]">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-[#1C2A42] bg-[#111D33]/50">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-3xl font-bold text-[#F4F4F8]">
              Ready to Start Speaking?
            </h2>
            <p className="mt-4 text-lg text-[#8A93A8]">
              Create your free account and begin your first role-play session in minutes.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/auth"
                className="rounded-lg bg-[#2D3BC5] px-8 py-3 text-sm font-semibold text-white transition hover:bg-[#3A4ADB]"
              >
                Create Your Account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#1C2A42] py-8 text-center text-sm text-[#6B7280]">
        AI DOJO — Japanese Role-Play Training
      </footer>
    </div>
  );
}
