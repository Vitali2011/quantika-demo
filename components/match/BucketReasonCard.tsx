import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import type { BucketReason } from '@/lib/matching/bucket-reason';

const BUCKET_LABEL: Record<BucketReason['bucket'], { title: string; cls: string }> = {
  main:             { title: 'Main match',      cls: 'text-emerald-600' },
  lowConfidence:    { title: 'Manual review',   cls: 'text-amber-600' },
  insufficientData: { title: 'Not enough data', cls: 'text-slate-500' },
  blocked:          { title: 'Blocked',          cls: 'text-red-500' },
};

export function BucketReasonCard({ bucketReason }: { bucketReason?: BucketReason }) {
  if (!bucketReason) return null;
  const meta = BUCKET_LABEL[bucketReason.bucket] ?? { title: bucketReason.bucket, cls: 'text-slate-500' };
  return (
    <Card size="sm" data-testid="bucket-reason-card">
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-wide text-ds-text-muted flex items-center justify-between">
          <span>Why this bucket</span>
          <span className={`font-medium ${meta.cls}`}>{meta.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-ds-text-muted leading-relaxed">{bucketReason.reason}</p>
      </CardContent>
    </Card>
  );
}
