import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing — Quantika',
  description: 'Quantika pricing plans for freight chartering teams',
};

interface PlanFeature {
  text: string;
  included: boolean;
}

interface Plan {
  name: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  cta: string;
  highlighted: boolean;
}

const PLANS: Plan[] = [
  {
    name: 'Starter',
    price: 'Free',
    period: 'demo',
    description: 'Try the full platform with sample data. No credit card required.',
    features: [
      { text: 'Sample email dataset', included: true },
      { text: 'Cargo & vessel parsing', included: true },
      { text: 'Match scoring & ranking', included: true },
      { text: 'Market indices (BDI / BSI / BCI)', included: true },
      { text: 'Live email inbox', included: false },
      { text: 'Sanctions screening', included: false },
      { text: 'Team seats', included: false },
    ],
    cta: 'Try demo',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$890',
    period: 'per month',
    description: 'For active chartering desks processing 50–200 emails per day.',
    features: [
      { text: 'Gmail / Outlook integration', included: true },
      { text: 'Cargo & vessel parsing', included: true },
      { text: 'Match scoring & ranking', included: true },
      { text: 'Market indices (BDI / BSI / BCI / BHSI)', included: true },
      { text: 'OFAC & EU sanctions screening', included: true },
      { text: 'TCE economics calculator', included: true },
      { text: '3 team seats', included: true },
    ],
    cta: 'Contact sales',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: 'annual contract',
    description: 'For trading houses and operators with high-volume, multi-desk needs.',
    features: [
      { text: 'Everything in Pro', included: true },
      { text: 'Unlimited email volume', included: true },
      { text: 'Unlimited team seats', included: true },
      { text: 'Dedicated onboarding & support', included: true },
      { text: 'WhatsApp integration', included: true },
      { text: 'Pipedrive CRM sync', included: true },
      { text: 'Custom data integrations', included: true },
    ],
    cta: 'Talk to us',
    highlighted: false,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-5xl mx-auto space-y-10">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-ds-accent transition-colors">
            ← Home
          </Link>
        </div>

        <header className="text-center space-y-3 max-w-xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900">Simple, transparent pricing</h1>
          <p className="text-slate-600">
            Start with the free demo. Upgrade when you&apos;re ready to connect your live inbox.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`bg-white rounded-2xl border p-6 flex flex-col space-y-5 ${
                plan.highlighted
                  ? 'border-ds-accent shadow-md ring-1 ring-ds-accent/20'
                  : 'border-slate-200'
              }`}
            >
              {plan.highlighted && (
                <div className="text-center">
                  <span className="inline-block bg-ds-accent text-ds-accent-fg text-xs font-semibold px-3 py-0.5 rounded-full">
                    Most popular
                  </span>
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">{plan.price}</span>
                  <span className="text-sm text-slate-500">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
              </div>

              <ul className="space-y-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex items-start gap-2 text-sm">
                    <span className={f.included ? 'text-green-500' : 'text-slate-300'}>
                      {f.included ? '✓' : '✗'}
                    </span>
                    <span className={f.included ? 'text-slate-700' : 'text-slate-400'}>
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>

              <a
                href="mailto:hello@quantika.org"
                className={`block text-center px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  plan.highlighted
                    ? 'bg-ds-accent text-ds-accent-fg hover:bg-ds-accent/90'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-slate-400">
          All prices exclude VAT · Annual billing available at 20% discount · Questions?{' '}
          <a href="mailto:hello@quantika.org" className="text-ds-accent hover:underline">
            hello@quantika.org
          </a>
        </p>

        <nav className="flex justify-center gap-4 text-sm">
          <Link href="/about" className="text-slate-500 hover:text-ds-accent transition-colors">About →</Link>
          <Link href="/market" className="text-slate-500 hover:text-ds-accent transition-colors">Market data →</Link>
        </nav>
      </div>
    </main>
  );
}
