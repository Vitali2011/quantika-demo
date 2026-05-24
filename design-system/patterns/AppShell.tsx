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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-ds-accent focus:text-ds-accent-fg focus:px-3 focus:py-2 focus:rounded-ds-md focus:font-medium"
        >
          Skip to content
        </a>
        <TopNav />
        <AIBar />
        <main id="main-content" className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
        <HelpFAB />
        <CmdKPalette />
      </div>
    </PaletteProvider>
  );
}
