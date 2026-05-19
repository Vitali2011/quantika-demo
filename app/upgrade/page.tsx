import type { Metadata } from 'next';
import { UpgradeTierCard } from '@/components/upgrade/UpgradeTierCard';

export const metadata: Metadata = {
  title: 'Upgrade Your Quantika Plan',
};

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
    cta: { type: 'upgrade' as const, href: '/billing/checkout?plan=pro', label: 'Upgrade to Pro' },
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

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Upgrade Your Quantika Plan</h1>
          <p className="text-sm text-gray-500">
            Trusted by freight brokers and charterers on the spot market.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-4">
          {TIERS.map((tier) => (
            <UpgradeTierCard key={tier.name} {...tier} />
          ))}
        </div>

        <blockquote className="max-w-lg mx-auto border-l-4 border-blue-200 pl-4 text-sm text-gray-600 italic">
          &ldquo;{TRUST_QUOTE.text}&rdquo;
          <cite className="block mt-1 not-italic text-gray-400 text-xs">
            — {TRUST_QUOTE.author}
          </cite>
        </blockquote>
      </div>
    </main>
  );
}
