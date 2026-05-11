/**
 * SanctionsBadge — показывает красную плашку "SANCTIONS BLOCKED" с reason.
 *
 * Используется на vessel/[id] и cargo/[id] detail pages когда сущность
 * участвует в session.blockedMatches с sanctions.blocking=true.
 *
 * Accessibility: role="alert", aria-label содержит полный reason.
 * Цвет: красный фон (bg-red-600) с белым текстом — WCAG AA contrast ratio > 4.5:1.
 */

interface SanctionsBadgeProps {
  /** Full reason string from BlockedMatch.filterReason, e.g. "IR-flagged vessel — OFAC/EU sanctions apply" */
  reason: string;
}

export function SanctionsBadge({ reason }: SanctionsBadgeProps) {
  if (!reason) return null;

  return (
    <div
      role="alert"
      aria-label={`Sanctions block: ${reason}`}
      className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3"
    >
      <span
        className="shrink-0 inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
        aria-hidden="true"
      >
        ⛔ SANCTIONS BLOCKED
      </span>
      <span className="text-sm text-red-800">{reason}</span>
    </div>
  );
}
