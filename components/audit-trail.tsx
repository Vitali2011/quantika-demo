'use client';

import { useEffect, useState } from 'react';
import type { AuditEntry } from '@/lib/types';

interface AuditTrailProps {
  inquiryId: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export default function AuditTrail({ inquiryId }: AuditTrailProps) {
  const [events, setEvents] = useState<AuditEntry[]>([]);

  useEffect(() => {
    fetch(`/api/audit?inquiryId=${encodeURIComponent(inquiryId)}`)
      .then((r) => r.json())
      .then((data: { events: AuditEntry[] }) => setEvents(data.events ?? []))
      .catch(() => setEvents([]));
  }, [inquiryId]);

  if (events.length === 0) {
    return <p className="text-sm text-gray-400">No audit events.</p>;
  }

  return (
    <ol className="audit-trail space-y-2">
      {events.map((e) => (
        <li key={e.id} className="flex gap-4 text-sm">
          <span className="font-mono text-gray-500">{formatTime(e.timestamp)}</span>
          <span className="badge">{e.actor}</span>
          <span>
            {e.action}
            {e.field ? ` ${e.field}` : ''}
          </span>
          {e.reason && <span className="text-gray-600">— {e.reason}</span>}
        </li>
      ))}
    </ol>
  );
}
