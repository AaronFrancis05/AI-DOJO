/* ───────────────────────────────────────────────
   Subscription / Upgrade (Panel 15) — UI only
   Pricing cards display. No payment provider is
   wired — no Stripe/Paddle dependency in deps.
   Real checkout requires a provider integration.
   ─────────────────────────────────────────────── */

'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import Link from 'next/link';
import { ArrowLeft, Check, Crown, Sparkles } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    features: [
      '5 sessions per month',
      'Basic scenarios',
      'Standard mode only',
      'Text-based feedback',
    ],
    cta: 'Current Plan',
    variant: 'secondary' as const,
    highlight: false,
  },
  {
    name: 'Premium',
    price: '$9.99',
    period: 'per month',
    features: [
      'Unlimited sessions',
      'All scenarios & domains',
      'Standard & Trouble modes',
      'Detailed voice feedback',
      'Priority support',
      'Advanced analytics',
    ],
    cta: 'Upgrade Now',
    variant: 'primary' as const,
    highlight: true,
  },
  {
    name: 'Annual',
    price: '$79.99',
    period: 'per year',
    features: [
      'Everything in Premium',
      '2 months free',
      'Exclusive avatar presets',
      'Early access to new features',
      'Custom practice plans',
    ],
    cta: 'Go Annual',
    variant: 'primary' as const,
    highlight: false,
    badge: 'Best Value',
  },
];

export default function BillingPage() {
  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link
        href="/settings"
        className="mb-6 inline-flex items-center gap-1 text-sm text-dojo-text-muted hover:text-dojo-text-primary transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-dojo-text-primary">Subscription</h1>
        <p className="mt-1 text-sm text-dojo-text-muted">
          Choose the plan that fits your learning journey
        </p>
      </div>

      {/* Current plan banner */}
      <Card raised className="mb-8 !p-5 border-dojo-accent/30">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-dojo-accent">
            <Crown className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-dojo-text-primary">Premium Plan</p>
              <Badge variant="accent">Active</Badge>
            </div>
            <p className="text-xs text-dojo-text-muted mt-0.5">
              Renews on March 15, 2025 · $9.99/month
            </p>
          </div>
          <Button variant="secondary" size="sm">Manage</Button>
        </div>
      </Card>

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            raised={plan.highlight}
            className={`relative flex flex-col ${
              plan.highlight ? 'border-dojo-accent' : ''
            }`}
          >
            {plan.badge && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge variant="accent">{plan.badge}</Badge>
              </div>
            )}

            {plan.highlight && (
              <div className="absolute -top-3 right-3">
                <Sparkles className="h-5 w-5 text-dojo-warning" />
              </div>
            )}

            <div className="flex-1">
              <h3 className="text-lg font-bold text-dojo-text-primary">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-dojo-text-primary">{plan.price}</span>
                <span className="text-xs text-dojo-text-muted">/{plan.period}</span>
              </div>

              <ul className="mt-6 space-y-3">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-dojo-text-muted">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dojo-success" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant={plan.variant}
              size="lg"
              className="mt-6 w-full"
              disabled={plan.name === 'Free'}
            >
              {plan.cta}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
