/**
 * PSC Search Page
 *
 * Standalone page for searching PSC inspection history by IMO.
 * Behind NEXT_PUBLIC_PSC_DETENTION_ENABLED flag.
 * Uses inline fetch — no redirect to deep-link.
 */

import { PscSearchForm } from '@/components/psc/PscSearchForm';

export const metadata = {
  title: 'PSC Inspection Search | Quantika',
  description: 'Search Port State Control inspection history by IMO number',
};

export default function PscSearchPage() {
  return (
    <main className="min-h-screen bg-ds-bg p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-2 text-2xl font-bold text-ds-text">
          PSC Inspection Search
        </h1>
        <p className="mb-6 text-sm text-ds-text-muted">
          Search Port State Control inspection history by IMO number.
        </p>
        <PscSearchForm />
      </div>
    </main>
  );
}
