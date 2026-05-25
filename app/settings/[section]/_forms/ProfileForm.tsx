'use client';
import { useState } from 'react';
import { Input, Button, Toast } from '@/design-system/primitives';

type ToastState = { variant: 'success' | 'danger'; message: string } | null;

export function ProfileForm() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
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
      const res = await fetch('/api/settings/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save');
      }
      showToast('success', 'Profile saved');
    } catch (err) {
      showToast('danger', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div className="space-y-1">
        <label className="text-xs font-medium text-ds-text-muted" htmlFor="display-name">
          Display name
        </label>
        <Input
          id="display-name"
          placeholder="Your name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-ds-text-muted" htmlFor="email-addr">
          Email
        </label>
        <Input
          id="email-addr"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button variant="primary" size="sm" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </Button>
      <Toast open={toast !== null} variant={toast?.variant ?? 'default'}>
        {toast?.message}
      </Toast>
    </form>
  );
}
