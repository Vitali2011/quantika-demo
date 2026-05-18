'use client';

import { useEffect } from 'react';
import { captureException } from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="bg-white border border-gray-200 rounded-xl p-8 max-w-md w-full text-center shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Не удалось загрузить Charterers
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Попробуйте обновить страницу или повторите попытку.
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Попробовать снова
        </button>
      </div>
    </div>
  );
}
