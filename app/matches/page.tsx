import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Matches — Quantika',
};

export default function MatchesPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-lg border p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold">Matches — coming soon</h1>
        <p className="text-sm text-gray-600">
          Список матчей появится в одном из следующих обновлений. Пока актуальные
          подсветки доступны на дашборде в блоке Top Priorities.
        </p>
        <Link
          href="/dashboard"
          className="inline-block px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          К дашборду
        </Link>
      </div>
    </main>
  );
}
