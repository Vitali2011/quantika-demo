interface TrialBannerProps {
  daysRemaining: number;
  expired: boolean;
}

export function TrialBanner({ daysRemaining, expired }: TrialBannerProps) {
  if (expired) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-sm flex justify-between items-center">
        <span>Your trial has expired. Upgrade to continue using Quantika.</span>
        <a href="/upgrade" className="text-red-700 underline">Upgrade now</a>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-sm flex justify-between items-center">
      <span>Trial: {daysRemaining} days remaining · activate by sending your first quote</span>
      <a href="/upgrade" className="text-blue-700 underline">Upgrade now</a>
    </div>
  );
}
