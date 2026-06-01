import { now } from '@/lib/clock';

interface MorningHeaderProps {
  userName?: string;
  alertCount: number;
}

// Pin timeZone to UTC so server and client render identical strings — avoids
// React #418 hydration mismatch at midnight boundaries when user TZ differs
// from server TZ (server is UTC by convention).
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export function MorningHeader({ userName, alertCount }: MorningHeaderProps) {
  const today = dateFormatter.format(now());
  const greeting = userName ? `Good morning, ${userName} 👋` : 'Good morning! 👋';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          {greeting}
        </h1>
        {alertCount > 0 && (
          <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
            {alertCount}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500" suppressHydrationWarning>{today}</p>
    </div>
  );
}
