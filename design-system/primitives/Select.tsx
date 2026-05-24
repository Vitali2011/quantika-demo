'use client';
import { Select as Base } from '@base-ui/react/select';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;

const Trigger = forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Base.Trigger> & { placeholder?: string }
>(({ className, placeholder, 'aria-label': ariaLabel, ...props }, ref) => (
  <Base.Trigger
    ref={ref}
    aria-label={ariaLabel ?? placeholder}
    className={cn(
      'inline-flex h-9 items-center justify-between gap-2 rounded-ds-md border border-ds-border bg-ds-surface px-3 text-sm text-ds-text',
      'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40',
      'disabled:opacity-50',
      className
    )}
    {...props}
  >
    <Base.Value placeholder={placeholder} />
    <Base.Icon aria-hidden="true">▾</Base.Icon>
  </Base.Trigger>
));
Trigger.displayName = 'Select.Trigger';

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, ...props }, ref) => (
  <Base.Portal>
    <Base.Positioner sideOffset={4}>
      <Base.Popup
        ref={ref}
        className={cn(
          'min-w-[8rem] overflow-hidden rounded-ds-md border border-ds-border bg-ds-surface shadow-lg p-1',
          className
        )}
        {...props}
      />
    </Base.Positioner>
  </Base.Portal>
));
Content.displayName = 'Select.Content';

const Item = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Item>
>(({ className, ...props }, ref) => (
  <Base.Item
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center rounded-ds-sm px-2 py-1.5 text-sm text-ds-text',
      'hover:bg-ds-surface-muted data-[highlighted]:bg-ds-accent data-[highlighted]:text-ds-accent-fg',
      className
    )}
    {...props}
  />
));
Item.displayName = 'Select.Item';

export const Select = { Root, Trigger, Content, Item };
