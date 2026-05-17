import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Request a New Deal — Quantika',
};

export default function RequestPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Request a New Deal</h1>

        <div className="bg-white rounded-lg border p-8 space-y-4">
          <p className="text-gray-500">
            Deal request form coming soon. Our team will reach out to help you
            submit your first deal.
          </p>
          <a
            href="mailto:sales@quantika.org"
            className="inline-block px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
          >
            Contact Sales
          </a>
        </div>

        <p className="text-sm text-gray-400">
          <Link href="/dashboard" className="underline hover:text-gray-600">
            ← Back to dashboard
          </Link>
        </p>
      </div>
    </main>
  );
}
