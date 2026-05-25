'use client';
import { useState } from 'react';
import { Button, Switch, Toast } from '@/design-system/primitives';
import { Card } from '@/design-system/primitives';

type ToastState = { variant: 'success' | 'danger'; message: string } | null;

const PREF_ITEMS = [
  { key: 'new_match', label: 'New match found', description: 'When AI finds a cargo-vessel match', defaultOn: true },
  { key: 'email_digest', label: 'Email digest', description: 'Daily summary of freight activity', defaultOn: true },
  { key: 'urgent_action', label: 'Urgent action required', description: 'Time-sensitive cargo or vessel positions', defaultOn: true },
  { key: 'weekly_report', label: 'Weekly market report', description: 'BHSI, TMI and rate summaries', defaultOn: false },
] as const;

type PrefKey = (typeof PREF_ITEMS)[number]['key'];

export function NotificationsForm() {
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    new_match: true,
    email_digest: true,
    urgent_action: true,
    weekly_report: false,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(variant: 'success' | 'danger', message: string) {
    setToast({ variant, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences: prefs }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save');
      }
      showToast('success', 'Notification preferences saved');
    } catch (err) {
      showToast('danger', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {PREF_ITEMS.map(({ key, label, description }) => (
        <Card key={key} padding="md">
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ds-text">{label}</p>
              <p className="text-xs text-ds-text-muted">{description}</p>
            </div>
            <Switch
              checked={prefs[key]}
              onCheckedChange={(checked: boolean) =>
                setPrefs((prev) => ({ ...prev, [key]: checked }))
              }
            />
          </div>
        </Card>
      ))}
      <Button variant="primary" size="sm" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save preferences'}
      </Button>
      <Toast open={toast !== null} variant={toast?.variant ?? 'default'}>
        {toast?.message}
      </Toast>
    </form>
  );
}
