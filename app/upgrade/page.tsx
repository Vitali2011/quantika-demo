import type { Metadata } from 'next';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Upgrade Your Quantika Plan',
};

const TIERS = [
  {
    name: 'Free',
    features: ['5 deals/month', 'Basic match score', 'Email digest'],
  },
  {
    name: 'Pro',
    features: ['Unlimited deals', 'AI explain-deal', 'WhatsApp digest', 'RAG clauses'],
  },
  {
    name: 'Enterprise',
    features: ['SSO', 'White-label', 'Dedicated support', 'API access'],
  },
];

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-center">Upgrade Your Quantika Plan</h1>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {TIERS.map((tier) => (
            <Card key={tier.name}>
              <CardHeader>
                <CardTitle>{tier.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-gray-700">
                  {tier.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-center">
          <a
            href="mailto:sales@quantika.org"
            className="inline-block px-6 py-3 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </main>
  );
}
