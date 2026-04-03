import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { RecapPoint, NegotiationStatus } from '@/lib/types';

const STATUS_CONFIG: Record<NegotiationStatus, { icon: React.ReactNode; label: string; color: string }> = {
  AGREED: { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, label: 'Agreed', color: 'border-green-200 bg-green-50' },
  PENDING: { icon: <Clock className="h-4 w-4 text-yellow-500" />, label: 'Pending', color: 'border-yellow-200 bg-yellow-50' },
  DISAGREED: { icon: <XCircle className="h-4 w-4 text-red-500" />, label: 'Disagreed', color: 'border-red-200 bg-red-50' },
};

interface RecapSectionProps {
  status: NegotiationStatus;
  points: RecapPoint[];
}

export function RecapSection({ status, points }: RecapSectionProps) {
  const config = STATUS_CONFIG[status];
  if (points.length === 0) return null;

  return (
    <Card className={`border ${config.color}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {config.icon}
          {config.label} ({points.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {points.map((point, i) => (
          <div key={i} className="border-b last:border-0 pb-3 last:pb-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-sm">{point.topic}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{point.currentValue}</p>
              </div>
              <Badge variant="outline" className="text-xs shrink-0">
                Email #{point.sourceEmailNumber}
              </Badge>
            </div>
            {point.sourceQuote && (
              <blockquote className="mt-2 text-xs text-muted-foreground border-l-2 pl-2 italic">
                &ldquo;{point.sourceQuote}&rdquo;
              </blockquote>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
