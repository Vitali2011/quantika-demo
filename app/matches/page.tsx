import type { Metadata } from 'next';
import Link from 'next/link';
import { DEMO_MATCHES } from './demo-data';

export const metadata: Metadata = {
  title: 'Your Recent Matches — Quantika',
};

export default function MatchesPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">Your Recent Matches</h1>

        {DEMO_MATCHES.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center space-y-4">
            <p className="text-gray-500">No matches yet</p>
            <Link
              href="/dashboard"
              className="inline-block px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
            >
              Submit your first deal request
            </Link>
          </div>
        ) : (
          <ul className="space-y-4">
            {DEMO_MATCHES.slice(0, 10).map((match, idx) => (
              <li key={idx} className="bg-white rounded-lg border p-4">
                <div className="font-medium">{match.vessel}</div>
                <div className="text-sm text-gray-600">{match.route}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Score: {match.score} · {match.date}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
