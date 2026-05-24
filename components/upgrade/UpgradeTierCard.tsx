import { Card } from '@/design-system/primitives';

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
          <span className="bg-ds-accent text-ds-accent-fg text-xs font-semibold px-3 py-0.5 rounded-ds-full">
            Most popular
          </span>
        </div>
      )}
      <Card
        padding="lg"
        className={highlighted ? 'ring-2 ring-ds-accent' : ''}
      >
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-ds-text">{name}</h3>
            <div className="mt-1 flex items-baseline gap-0.5">
              <span className="text-2xl font-bold text-ds-text">{price}</span>
              {priceNote && (
                <span className="text-sm text-ds-text-muted">{priceNote}</span>
              )}
            </div>
          </div>

          <ul className="space-y-1.5 text-sm text-ds-text">
            {features.map((feature) => (
              <li key={feature} className="flex items-center gap-1.5">
                <span className="text-ds-success font-bold" aria-hidden="true">✓</span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="pt-2">
            {cta.type === 'current' && (
              <button
                disabled
                aria-label={cta.label}
                className="w-full px-4 py-3 min-h-[44px] text-sm text-ds-text-muted bg-ds-surface rounded-ds-md cursor-not-allowed border border-ds-border"
              >
                {cta.label}
              </button>
            )}
            {cta.type === 'upgrade' && (
              <a
                href={cta.href}
                aria-label={cta.label}
                className="block w-full px-4 py-3 min-h-[44px] text-center text-sm font-semibold text-ds-accent-fg bg-ds-accent rounded-ds-md hover:bg-ds-accent/90 transition-colors duration-ds-fast"
              >
                {cta.label}
              </a>
            )}
            {cta.type === 'contact' && (
              <a
                href={cta.href}
                aria-label={cta.label}
                data-testid="enterprise-cta"
                className="block w-full px-4 py-3 min-h-[44px] text-center text-sm font-medium text-ds-text bg-ds-surface rounded-ds-md hover:bg-ds-surface-muted transition-colors duration-ds-fast border border-ds-border"
              >
                {cta.label}
              </a>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
