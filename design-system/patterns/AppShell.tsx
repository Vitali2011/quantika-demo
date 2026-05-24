'use client';
import type { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { AIBarPlaceholder } from './AIBarPlaceholder';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ds-bg text-ds-text flex flex-col">
      <TopNav />
      <AIBarPlaceholder />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <BottomNav />
    </div>
  );
}
