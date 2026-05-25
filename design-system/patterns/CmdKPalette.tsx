'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, Input, Tabs } from '@/design-system/primitives';
import { usePalette } from './usePalette';
import { ActionsTab } from './PaletteTabs/ActionsTab';
import { NavigateTab } from './PaletteTabs/NavigateTab';
import { HelpTab } from './PaletteTabs/HelpTab';
import { RecentsTab } from './PaletteTabs/RecentsTab';

interface ParsedEmailResult {
  cargo_type: string | null;
  load_port: string | null;
  discharge_port: string | null;
  laycan: string | null;
}

export function CmdKPalette() {
  const { isOpen, close, activeTab, setTab } = usePalette();
  const [query, setQuery] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const showEmailButton = query.length > 100 && query.includes('\n');

  async function handleEmailParse() {
    setIsParsing(true);
    try {
      const res = await fetch('/api/parser/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: query }),
      });
      const data = await res.json() as { parsed: ParsedEmailResult | null };
      const parsed = data.parsed;
      close();
      const params = new URLSearchParams();
      if (parsed?.cargo_type) params.set('cargo_type', parsed.cargo_type);
      if (parsed?.load_port) params.set('route', parsed.load_port);
      router.push(params.toString() ? `/matches?${params}` : '/matches');
    } catch {
      // silently ignore — user can retry
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(v: boolean) => { if (!v) close(); }}>
      <Dialog.Content className="!max-w-xl !top-[20vh] !translate-y-0">
        <Dialog.Title className="!mb-2">Quick actions</Dialog.Title>
        <Input
          ref={inputRef}
          placeholder="Search or ask…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showEmailButton && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleEmailParse}
              disabled={isParsing}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-ds-accent text-ds-accent-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              data-testid="email-parse-btn"
            >
              {isParsing ? 'Parsing…' : '📧 Parse as broker email →'}
            </button>
          </div>
        )}
        <div className="mt-3">
          <Tabs.Root value={activeTab} onValueChange={(v: string) => setTab(v as typeof activeTab)}>
            <Tabs.List>
              <Tabs.Trigger value="actions">Actions</Tabs.Trigger>
              <Tabs.Trigger value="navigate">Navigate</Tabs.Trigger>
              <Tabs.Trigger value="help">Help</Tabs.Trigger>
              <Tabs.Trigger value="recents">Recents</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Panel value="actions"><ActionsTab query={query} onSelect={close} /></Tabs.Panel>
            <Tabs.Panel value="navigate"><NavigateTab query={query} onSelect={close} /></Tabs.Panel>
            <Tabs.Panel value="help"><HelpTab query={query} /></Tabs.Panel>
            <Tabs.Panel value="recents"><RecentsTab onSelect={close} /></Tabs.Panel>
          </Tabs.Root>
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
