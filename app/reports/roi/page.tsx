// audit D revive: ROI report surface
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getSession } from '@/lib/session';
import { getStore } from '@/lib/session-store';
import { getRoiSummary } from '@/lib/analytics/roi-metrics';
import { safeGenerateRoiReport } from '@/lib/email/templates/roi-report';

export const metadata: Metadata = {
  title: 'ROI Report — Quantika',
};

// Historical convention from the original /api/analytics/roi route (#920).
const PLATFORM_COST_USD_PER_VOYAGE = 99;

export default async function RoiReportPage() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get('session_id')?.value;
  const session = sessionId ? getSession(sessionId) : null;

  if (!session) {
    return (
      <main className="min-h-screen bg-ds-bg flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="text-4xl">📭</div>
          <h1 className="text-xl font-bold text-ds-text">No ROI data</h1>
          <p className="text-sm text-ds-text-muted">Upload emails to start tracking voyage savings.</p>
          <Link href="/processing" className="inline-block px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Upload emails
          </Link>
        </div>
      </main>
    );
  }

  let report: ReturnType<typeof safeGenerateRoiReport>;
  try {
    const db = getStore().getDb();
    const summary = getRoiSummary(db, PLATFORM_COST_USD_PER_VOYAGE, 90);
    report = safeGenerateRoiReport(summary);
  } catch (err) {
    report = { ok: false, error: err instanceof Error ? err.message : 'Failed to compute ROI summary' };
  }

  if (!report.ok) {
    return (
      <main className="min-h-screen bg-ds-bg px-4 py-10">
        <div className="max-w-2xl mx-auto space-y-4">
          <h1 className="text-xl font-bold text-ds-text">ROI report unavailable</h1>
          <p className="text-sm text-ds-text-muted">Could not generate the report: {report.error}</p>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">← Back to dashboard</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ds-bg px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-ds-text">{report.subject}</h1>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline whitespace-nowrap">← Dashboard</Link>
        </div>
        <p className="text-xs text-ds-text-muted">
          Preview of the 90-day ROI report email, computed live from recorded voyage metrics.
        </p>
        <pre className="whitespace-pre-wrap text-sm text-ds-text bg-ds-surface border border-ds-border rounded-ds-lg p-6 font-mono">
          {report.body}
        </pre>
      </div>
    </main>
  );
}
