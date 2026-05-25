'use client';
import { useContext } from 'react';
import { ModeContext, type Mode } from './ModeProvider';

const COPY: Record<Mode, Record<string, string>> = {
  charterer: {
    'aibar.placeholder': 'Ask anything — Show fresh HSS matches above 85 score',
    'nav.thirdSlot': 'Cargo',
    'nav.fourthSlot': 'Vessels',
    'page.title.suffix': 'Charterer',
    'matches.empty.cta': 'Загрузи первый груз → найдём суда',
  },
  owner: {
    'aibar.placeholder': 'Ask anything — Show fresh HSS matches above 85 score',
    'nav.thirdSlot': 'Vessels',
    'nav.fourthSlot': 'Cargo',
    'page.title.suffix': 'Owner',
    'matches.empty.cta': 'Добавь первое судно → найдём грузы',
  },
};

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be inside <ModeProvider>');
  const { mode, setMode } = ctx;
  return {
    mode,
    setMode,
    isCharterer: mode === 'charterer',
    isOwner: mode === 'owner',
    t: (key: string) => COPY[mode][key] ?? key,
  };
}
