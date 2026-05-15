import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Запросить апгрейд — Quantika',
};

export default function UpgradePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-lg border p-6 space-y-4 text-center">
        <h1 className="text-xl font-bold">Запросить апгрейд</h1>
        <p className="text-sm text-gray-600">
          Свяжитесь с нами, чтобы перейти на полный тариф. Мы ответим в течение рабочего дня.
        </p>
        <a
          href="mailto:hello@quantika.org"
          className="inline-block px-4 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
        >
          hello@quantika.org
        </a>
      </div>
    </main>
  );
}
