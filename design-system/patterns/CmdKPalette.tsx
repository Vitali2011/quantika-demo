'use client';
import { useState, useRef, useEffect } from 'react';
import { Dialog, Input, Tabs } from '@/design-system/primitives';
import { usePalette } from './usePalette';
import { ActionsTab } from './PaletteTabs/ActionsTab';
import { NavigateTab } from './PaletteTabs/NavigateTab';
import { HelpTab } from './PaletteTabs/HelpTab';
import { RecentsTab } from './PaletteTabs/RecentsTab';

export function CmdKPalette() {
  const { isOpen, close, activeTab, setTab } = usePalette();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

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
