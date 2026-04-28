interface EconomicsTabProps {
  commissionPercent?: number | null;
}

export function EconomicsTab({ commissionPercent }: EconomicsTabProps) {
  return (
    <div data-testid="tab-economics" className="space-y-4 text-sm">
      {commissionPercent != null && (
        <div>
          <span className="text-gray-500">Commission</span>
          <p className="font-medium">{commissionPercent}%</p>
        </div>
      )}
      <div className="rounded border border-dashed border-gray-300 p-4 text-gray-400 text-center text-xs">
        Bunker / ETS / war-risk costs — coming in spec-08 (Wave 2)
      </div>
    </div>
  );
}
