'use client';
import { LiveStripCard } from './LiveStripCard';
import type { LiveJob } from './useLiveJobs';

export function LiveStrip({ jobs }: { jobs: LiveJob[] }) {
  const active = jobs.filter((j) => j.status !== 'done' && j.progress_percent < 100);
  if (jobs.length === 0) return null;

  const done = jobs.filter((j) => j.progress_percent >= 100).length;
  const total = jobs.length;
  const avgPercent = Math.round(
    jobs.reduce((s, j) => s + j.progress_percent, 0) / total,
  );

  return (
    <div
      className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-300 px-6 py-3"
      role="region"
      aria-label="Live email processing"
    >
      <div className="flex items-center justify-between text-xs text-amber-900 mb-2">
        <span>
          <b>
            📥 Обрабатываем {total} email{total > 1 ? "'ов" : ''}
          </b>{' '}
          · {done}/{total} готово
        </span>
        {active.length > 0 && (
          <span className="text-amber-700 animate-pulse">live</span>
        )}
      </div>
      <div
        className="h-1.5 bg-amber-100 rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={avgPercent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full bg-amber-500 transition-all duration-300"
          style={{ width: `${avgPercent}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 md:grid-cols-5 gap-1.5">
        {jobs.slice(0, 5).map((j) => (
          <LiveStripCard
            key={j.id}
            from={j.from ?? '...'}
            subject={j.email_subject ?? j.current_step ?? ''}
            status={
              j.progress_percent === 0
                ? 'queue'
                : j.progress_percent >= 100
                  ? 'done'
                  : 'active'
            }
            matchHint={j.current_step}
          />
        ))}
      </div>
    </div>
  );
}
