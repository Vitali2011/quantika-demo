import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Request a New Deal — Quantika',
};

export default function RequestPage() {
  return (
    <main className="min-h-screen bg-ds-bg px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-ds-text">Request a New Deal</h1>

        <div className="bg-ds-surface rounded-ds-md border border-ds-border p-8 space-y-4">
          <p className="text-ds-text-muted">
            Deal request form coming soon. Our team will reach out to help you
            submit your first deal.
          </p>
          <a
            href="mailto:sales@quantika.org"
            className="inline-flex items-center justify-center px-4 py-2 rounded-ds-md bg-ds-accent text-ds-accent-fg text-sm font-medium hover:bg-ds-accent/90 transition-colors duration-ds-fast"
          >
            Contact Sales
          </a>
        </div>

        <p className="text-sm text-ds-text-muted">
          <Link href="/dashboard" className="underline hover:text-ds-text transition-colors duration-ds-fast">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
