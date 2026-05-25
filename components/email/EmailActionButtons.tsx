'use client';

import { useState } from 'react';
import { Button, Toast } from '@/design-system/primitives';
import { csrfFetch } from '@/lib/csrf-client';

type ToastState = { variant: 'success' | 'danger'; message: string } | null;
type BusyAction = 'accept' | 'reject' | null;

interface EmailActionButtonsProps {
  emailId: string;
}

export function EmailActionButtons({ emailId }: EmailActionButtonsProps) {
  const [busy, setBusy] = useState<BusyAction>(null);
  const [done, setDone] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  function showToast(variant: 'success' | 'danger', message: string) {
    setToast({ variant, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleAction(action: 'accept' | 'reject') {
    setBusy(action);
    try {
      const res = await csrfFetch('/api/email/action', {
        method: 'POST',
        body: JSON.stringify({ emailId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Action failed');
      setDone(true);
      showToast('success', action === 'accept' ? 'Email accepted' : 'Email rejected');
    } catch (err) {
      showToast('danger', err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  function handleEdit() {
    window.location.href = `/email/${emailId}`;
  }

  if (done) {
    return (
      <>
        <span className="text-xs text-ds-text-muted">Action recorded</span>
        <Toast open={toast !== null} variant={toast?.variant ?? 'default'}>
          {toast?.message}
        </Toast>
      </>
    );
  }

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        disabled={busy !== null}
        onClick={() => handleAction('accept')}
      >
        {busy === 'accept' ? 'Accepting…' : 'Accept'}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy !== null}
        onClick={handleEdit}
      >
        Edit
      </Button>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy !== null}
        className="text-ds-danger hover:bg-red-50"
        onClick={() => handleAction('reject')}
      >
        {busy === 'reject' ? 'Rejecting…' : 'Reject'}
      </Button>
      <Toast open={toast !== null} variant={toast?.variant ?? 'default'}>
        {toast?.message}
      </Toast>
    </>
  );
}
