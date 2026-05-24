'use client';
import { useState } from 'react';
import {
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  Pill,
  Card,
  Skeleton,
  Avatar,
  Toast,
  Dialog,
  Sheet,
  Tabs,
  Switch,
  Tooltip,
} from '@/design-system/primitives';

export default function DesignPage() {
  const [toastOpen, setToastOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [switchOn, setSwitchOn] = useState(false);

  return (
    <main className="min-h-screen bg-ds-bg text-ds-text p-6 space-y-8 font-sans">
      <header>
        <h1 className="text-3xl font-bold">Design System · R1 preview</h1>
        <p className="text-ds-text-muted text-sm mt-1">
          Maritime Deep palette · 15 primitives · internal page (не в nav)
        </p>
      </header>

      {/* Tokens — swatches */}
      <section aria-labelledby="t-tokens">
        <h2 id="t-tokens" className="text-xl font-semibold mb-3">
          Tokens · colors
        </h2>
        <div className="grid grid-cols-6 gap-3">
          {(
            [
              ['bg', '--ds-bg'],
              ['surface', '--ds-surface'],
              ['border', '--ds-border'],
              ['text', '--ds-text'],
              ['text-muted', '--ds-text-muted'],
              ['text-subtle', '--ds-text-subtle'],
              ['accent', '--ds-accent'],
              ['accent-fg', '--ds-accent-fg'],
              ['accent-soft', '--ds-accent-soft'],
              ['success', '--ds-success'],
              ['warn', '--ds-warn'],
              ['danger', '--ds-danger'],
            ] as [string, string][]
          ).map(([name, varName]) => (
            <div key={name} className="border border-ds-border rounded-ds-md p-3 bg-ds-surface">
              <div
                className="h-10 rounded-ds-sm border border-ds-border"
                style={{ background: `var(${varName})` }}
              />
              <div className="mt-2 text-xs font-semibold">{name}</div>
              <code className="text-[10px] text-ds-text-muted">{varName}</code>
            </div>
          ))}
        </div>
      </section>

      {/* Buttons */}
      <section aria-labelledby="t-buttons">
        <h2 id="t-buttons" className="text-xl font-semibold mb-3">
          Button
        </h2>
        <div className="flex gap-2 items-center flex-wrap">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button disabled>Disabled</Button>
        </div>
      </section>

      {/* Inputs */}
      <section aria-labelledby="t-form">
        <h2 id="t-form" className="text-xl font-semibold mb-3">
          Form
        </h2>
        <div className="grid grid-cols-3 gap-3 max-w-3xl">
          <Input placeholder="Email" />
          <Input placeholder="Disabled" disabled />
          <Input placeholder="Invalid" aria-invalid="true" />
          <Textarea placeholder="Notes…" />
          <Select.Root>
            <Select.Trigger placeholder="Choose port" />
            <Select.Content>
              <Select.Item value="cons">Constanta</Select.Item>
              <Select.Item value="alg">Algeciras</Select.Item>
              <Select.Item value="ven">Venice</Select.Item>
            </Select.Content>
          </Select.Root>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={switchOn} onCheckedChange={setSwitchOn} aria-label="Dark mode" />
            Dark mode (preview)
          </label>
        </div>
      </section>

      {/* Badges + Pills */}
      <section aria-labelledby="t-badge">
        <h2 id="t-badge" className="text-xl font-semibold mb-3">
          Badge &amp; Pill
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Badge>default</Badge>
          <Badge variant="success">success</Badge>
          <Badge variant="warn">warn</Badge>
          <Badge variant="danger">danger</Badge>
          <Badge variant="info">info</Badge>
          <Badge variant="outline">outline</Badge>
          <Pill>94</Pill>
          <Pill variant="success">match</Pill>
          <Pill variant="warn">pending</Pill>
          <Pill variant="danger">declined</Pill>
        </div>
      </section>

      {/* Cards */}
      <section aria-labelledby="t-card">
        <h2 id="t-card" className="text-xl font-semibold mb-3">
          Card
        </h2>
        <div className="grid grid-cols-3 gap-3 max-w-3xl">
          <Card>
            <div className="text-sm font-semibold">Static card</div>
            <div className="text-xs text-ds-text-muted mt-1">default padding md</div>
          </Card>
          <Card interactive>
            <div className="text-sm font-semibold">Interactive card</div>
            <div className="text-xs text-ds-text-muted mt-1">hover state</div>
          </Card>
          <Card padding="lg">
            <div className="text-sm font-semibold">Large padding</div>
          </Card>
        </div>
      </section>

      {/* Skeleton */}
      <section aria-labelledby="t-skel">
        <h2 id="t-skel" className="text-xl font-semibold mb-3">
          Skeleton
        </h2>
        <div className="space-y-2 max-w-md">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </section>

      {/* Avatar */}
      <section aria-labelledby="t-avatar">
        <h2 id="t-avatar" className="text-xl font-semibold mb-3">
          Avatar
        </h2>
        <div className="flex gap-2 items-center">
          <Avatar name="Boris Ivanov" size="sm" />
          <Avatar name="Maria Schmidt" />
          <Avatar name="Petra Lang" size="lg" />
        </div>
      </section>

      {/* Tabs */}
      <section aria-labelledby="t-tabs">
        <h2 id="t-tabs" className="text-xl font-semibold mb-3">
          Tabs
        </h2>
        <Tabs.Root defaultValue="overview" className="max-w-xl">
          <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="economics">Economics</Tabs.Trigger>
            <Tabs.Trigger value="quote">Quote</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Panel value="overview">
            <div className="text-sm">Overview content</div>
          </Tabs.Panel>
          <Tabs.Panel value="economics">
            <div className="text-sm">Economics content</div>
          </Tabs.Panel>
          <Tabs.Panel value="quote">
            <div className="text-sm">Quote content</div>
          </Tabs.Panel>
        </Tabs.Root>
      </section>

      {/* Overlays */}
      <section aria-labelledby="t-overlays">
        <h2 id="t-overlays" className="text-xl font-semibold mb-3">
          Overlays
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={() => setToastOpen(true)}>Show toast</Button>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="ghost" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
          <Tooltip.Provider>
            <Tooltip.Root>
              <Tooltip.Trigger render={<Button variant="secondary" />}>
                Hover tooltip
              </Tooltip.Trigger>
              <Tooltip.Content>Tip text</Tooltip.Content>
            </Tooltip.Root>
          </Tooltip.Provider>
        </div>

        <Toast open={toastOpen} variant="success">
          ✨ Match saved{' '}
          <button className="ml-2 underline" onClick={() => setToastOpen(false)}>
            close
          </button>
        </Toast>

        <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
          <Dialog.Content>
            <Dialog.Title>Confirm action</Dialog.Title>
            <Dialog.Description>Это превью dialog primitive.</Dialog.Description>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
            </div>
          </Dialog.Content>
        </Dialog.Root>

        <Sheet.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Sheet.Content>
            <h3 className="text-base font-semibold">Bottom sheet</h3>
            <p className="text-sm text-ds-text-muted mt-1">Mobile-style bottom sheet.</p>
            <Button className="mt-3" onClick={() => setSheetOpen(false)}>
              Close
            </Button>
          </Sheet.Content>
        </Sheet.Root>
      </section>
    </main>
  );
}
