import type { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies } from 'next/headers';
import { getTrialState } from '@/lib/trial';
import { UpgradeTierCard } from '@/components/upgrade/UpgradeTierCard';

export const metadata: Metadata = {
  title: 'Upgrade Your Quantika Plan',
};

const PLAN_IDS = { PRO: 'pro' } as const;

const TIERS = [
  {
    name: 'Free',
    price: '$0',
    priceNote: '/mo',
    features: ['5 deals/month', 'Basic match score', 'Email digest'],
    cta: { type: 'current' as const, label: "You're on this plan" },
  },
  {
    name: 'Pro',
    price: '$49',
    priceNote: '/mo',
    features: ['Unlimited deals', 'AI explain-deal', 'WhatsApp digest', 'RAG clauses'],
    cta: { type: 'upgrade' as const, href: `/billing/checkout?plan=${PLAN_IDS.PRO}`, label: 'Upgrade to Pro' },
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    features: ['SSO', 'White-label', 'Dedicated support', 'API access'],
    cta: { type: 'contact' as const, href: 'mailto:sales@quantika.org', label: 'Contact sales' },
  },
];

const TRUST_QUOTE = {
  text: 'Quantika cut our fixture review time from 2 hours to 15 minutes.',
  author: 'Operations Manager, dry bulk broker',
};

async function UsageBanner() {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get('session_id')?.value;
    if (!sessionId) return null;
    const trial = await getTrialState(sessionId);
    if (!trial) return null;
    const elapsed = Math.floor((Date.now() - new Date(trial.started_at).getTime()) / 86400000);
    const daysLeft = Math.max(0, 14 - elapsed);
    const pct = Math.max(5, Math.min(100, (elapsed / 14) * 100));
    return (
      <div className="rounded-ds-md border border-ds-border bg-ds-surface px-4 py-3 flex items-center gap-4">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-ds-text">Trial usage</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-ds-full bg-ds-border overflow-hidden">
              <div
                className="h-full bg-ds-accent rounded-ds-full transition-all duration-ds-slow"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-ds-text-muted shrink-0 tabular-nums">
              {daysLeft}d left
            </span>
          </div>
        </div>
      </div>
    );
  } catch {
    return null;
  }
}

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-ds-bg px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <Suspense fallback={null}>
          <UsageBanner />
        </Suspense>

        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-ds-text">Upgrade Your Quantika Plan</h1>
          <p className="text-sm text-ds-text-muted">
            Trusted by freight brokers and charterers on the spot market.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
          {TIERS.map((tier) => (
            <UpgradeTierCard key={tier.name} {...tier} />
          ))}
        </div>

        <blockquote className="max-w-lg mx-auto border-l-4 border-ds-accent/20 pl-4 text-sm text-ds-text-muted italic">
          &ldquo;{TRUST_QUOTE.text}&rdquo;
          <cite className="block mt-1 not-italic text-ds-text-muted/70 text-xs">
            — {TRUST_QUOTE.author}
          </cite>
        </blockquote>
      </div>
    </main>
  );
}
