'use client';
import { useState } from 'react';
import { Input, Button, Toast } from '@/design-system/primitives';

type ToastState = { variant: 'success' | 'danger'; message: string } | null;

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to update password');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('success', 'Password updated');
    } catch (err) {
      showToast('danger', err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div className="space-y-1">
        <label className="text-xs font-medium text-ds-text-muted" htmlFor="current-password">
          Current password
        </label>
        <Input
          id="current-password"
          type="password"
          placeholder="••••••••"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-ds-text-muted" htmlFor="new-password">
          New password
        </label>
        <Input
          id="new-password"
          type="password"
          placeholder="••••••••"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-ds-text-muted" htmlFor="confirm-password">
          Confirm new password
        </label>
        <Input
          id="confirm-password"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <Button variant="primary" size="sm" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Update password'}
      </Button>
      <Toast open={toast !== null} variant={toast?.variant ?? 'default'}>
        {toast?.message}
      </Toast>
    </form>
  );
}
