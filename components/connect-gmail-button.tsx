'use client';

import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

export function ConnectGmailButton() {
  return (
    <Button
      size="lg"
      className="gap-2 text-base px-8 py-6"
      onClick={() => { window.location.href = '/api/auth/google'; }}
    >
      <Mail className="h-5 w-5" />
      Connect Gmail
    </Button>
  );
}
