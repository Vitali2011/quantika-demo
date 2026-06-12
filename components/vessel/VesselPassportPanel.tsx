/**
 * VesselPassportPanel — vetting summary card for a parsed vessel (audit D).
 *
 * Purely presentational: takes a VesselPassport built server-side from
 * real data (parsed fields + local registries + PSC table). Rows render
 * ONLY when data is present — absent data is omitted, never faked.
 * Renders nothing at all when the passport carries no displayable fields.
 */
import { Badge } from '@/design-system/primitives';
import { ShieldCheck } from 'lucide-react';
import type { VesselPassport } from '@/lib/counterparty';

const MOU_VARIANT = {
  white: 'success',
  grey: 'warn',
  black: 'danger',
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center text-sm py-1 border-b border-ds-border">
      <span className="text-ds-text-muted">{label}</span>
      <span className="font-medium text-ds-text inline-flex items-center gap-1.5">{children}</span>
    </div>
  );
}

export function VesselPassportPanel({ passport }: { passport: VesselPassport }) {
  const { flag, class: cls, pi, age, sanctions, psc } = passport;
  const hasData =
    flag != null || cls != null || pi != null || age != null || sanctions != null || psc != null;
  if (!hasData) return null;

  return (
    <div>
      <h4 className="text-xs font-medium text-ds-text-muted mb-1 flex items-center gap-1">
        <ShieldCheck className="h-3.5 w-3.5" />
        Vessel passport
      </h4>
      {flag && (
        <Row label="Flag">
          {flag.country}
          {flag.parisMou && (
            <Badge variant={MOU_VARIANT[flag.parisMou]} className="text-xs">
              Paris MoU: {flag.parisMou}
            </Badge>
          )}
        </Row>
      )}
      {cls && (
        <Row label="Class">
          {cls.society}
          {cls.isIacs && (
            <Badge variant="success" className="text-xs">✓ IACS</Badge>
          )}
        </Row>
      )}
      {pi && (
        <Row label="P&I">
          {pi.club}
          {pi.isIg && (
            <Badge variant="success" className="text-xs">✓ IG Club</Badge>
          )}
        </Row>
      )}
      {age != null && <Row label="Age">{age} yrs</Row>}
      {sanctions && (
        <Row label="Sanctions">
          {sanctions.sanctioned ? (
            <Badge variant="danger" className="text-xs">
              Flagged{sanctions.sources.length > 0 ? `: ${sanctions.sources.join(', ')}` : ''}
            </Badge>
          ) : (
            <Badge variant="success" className="text-xs">Clean</Badge>
          )}
        </Row>
      )}
      {psc && (
        <Row label="PSC detentions (3y)">
          <span className={psc.detentions3y > 0 ? 'text-ds-danger' : undefined}>
            {psc.detentions3y}
          </span>
        </Row>
      )}
    </div>
  );
}
