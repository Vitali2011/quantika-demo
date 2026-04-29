interface MorningHeaderProps {
  userName: string;
  alertCount: number;
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function MorningHeader({ userName, alertCount }: MorningHeaderProps) {
  const today = dateFormatter.format(new Date());

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">
          Good morning, {userName}
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
