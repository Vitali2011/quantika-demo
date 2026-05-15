/**
 * PscHistoryLink — small navigation link to /vessels/[imo]/psc-history.
 *
 * Gated by NEXT_PUBLIC_PSC_DETENTION_ENABLED. Renders nothing when the
 * flag is OFF or when no IMO is available, so the parent page can render
 * it unconditionally without leaking the feature in non-prod builds.
 */
import Link from 'next/link';
import { Anchor } from 'lucide-react';

interface PscHistoryLinkProps {
  /** Vessel IMO (7 digits). If empty/null, the link is hidden. */
  imo: string | null | undefined;
}

export function PscHistoryLink({ imo }: PscHistoryLinkProps) {
  if (process.env.NEXT_PUBLIC_PSC_DETENTION_ENABLED !== 'true') return null;
  if (!imo) return null;

  return (
    <Link
      href={`/vessels/${imo}/psc-history`}
      className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
    >
      <Anchor className="h-3.5 w-3.5" />
      PSC History
    </Link>
  );
}
