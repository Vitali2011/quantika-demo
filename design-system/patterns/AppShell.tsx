'use client';
import type { ReactNode } from 'react';
import { TopNav } from './TopNav';
import { BottomNav } from './BottomNav';
import { AIBar } from './AIBar';
import { CmdKPalette } from './CmdKPalette';
import { HelpFAB } from './HelpFAB';
import { PaletteProvider } from './usePalette';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <PaletteProvider>
      <div className="min-h-screen bg-ds-bg text-ds-text flex flex-col">
        <TopNav />
        <AIBar />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
        <HelpFAB />
        <CmdKPalette />
      </div>
    </PaletteProvider>
  );
}
