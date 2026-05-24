'use client';
import { Tabs as Base } from '@base-ui/react/tabs';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;

const List = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.List>
>(({ className, ...props }, ref) => (
  <Base.List ref={ref} className={cn('flex gap-6 border-b border-ds-border', className)} {...props} />
));
List.displayName = 'Tabs.List';

const Trigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Base.Tab>
>(({ className, ...props }, ref) => (
  <Base.Tab
    ref={ref}
    className={cn(
      'py-2 text-sm text-ds-text-muted hover:text-ds-text border-b-2 border-transparent',
      'data-[selected]:text-ds-text data-[selected]:font-semibold data-[selected]:border-ds-accent-fg',
      className
    )}
    {...props}
  />
));
Trigger.displayName = 'Tabs.Trigger';

const Panel = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Panel>
>(({ className, ...props }, ref) => (
  <Base.Panel ref={ref} className={cn('pt-4', className)} {...props} />
));
Panel.displayName = 'Tabs.Panel';

export const Tabs = { Root, List, Trigger, Panel };
