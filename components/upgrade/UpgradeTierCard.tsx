import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';

type TierCTA =
  | { type: 'current'; label: string }
  | { type: 'upgrade'; href: string; label: string }
  | { type: 'contact'; href: string; label: string };

export type UpgradeTierCardProps = {
  name: string;
  price: string;
  priceNote?: string;
  features: string[];
  cta: TierCTA;
  highlighted?: boolean;
};

export function UpgradeTierCard({
  name,
  price,
  priceNote,
  features,
  cta,
  highlighted = false,
}: UpgradeTierCardProps) {
  return (
    <div className="relative">
      {highlighted && (
        <div className="absolute inset-x-0 -top-3 flex justify-center z-10">
          <span className="bg-blue-600 text-white text-xs font-semibold px-3 py-0.5 rounded-full">
            Most popular
          </span>
        </div>
      )}
      <Card className={highlighted ? 'ring-2 ring-blue-600' : ''}>
        <CardHeader>
          <CardTitle>{name}</CardTitle>
          <div className="mt-1 flex items-baseline gap-0.5">
            <span className="text-2xl font-bold text-gray-900">{price}</span>
            {priceNote && (
              <span className="text-sm text-gray-500">{priceNote}</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-sm text-gray-700">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-1.5">
                <span className="text-blue-500 font-bold" aria-hidden="true">✓</span>
                {feature}
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          {cta.type === 'current' && (
            <button
              disabled
              aria-label={cta.label}
              className="w-full px-4 py-3 min-h-[44px] text-sm text-gray-400 bg-gray-100 rounded cursor-not-allowed border border-gray-200"
            >
              {cta.label}
            </button>
          )}
          {cta.type === 'upgrade' && (
            <a
              href={cta.href}
              aria-label={cta.label}
              className="block w-full px-4 py-3 min-h-[44px] text-center text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
            >
              {cta.label}
            </a>
          )}
          {cta.type === 'contact' && (
            <a
              href={cta.href}
              aria-label={cta.label}
              data-testid="enterprise-cta"
              className="block w-full px-4 py-3 min-h-[44px] text-center text-sm font-medium text-gray-700 bg-white rounded hover:bg-gray-50 transition-colors border border-gray-300"
            >
              {cta.label}
            </a>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
