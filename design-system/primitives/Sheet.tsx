'use client';
import { Dialog as Base } from '@base-ui/react/dialog';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;
const Trigger = Base.Trigger;

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, ...props }, ref) => (
  <Base.Portal>
    <Base.Backdrop className="fixed inset-0 z-40 bg-black/40" />
    <Base.Popup
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto',
        'rounded-t-ds-lg bg-ds-surface border-t border-ds-border shadow-xl p-4',
        className
      )}
      {...props}
    />
  </Base.Portal>
));
Content.displayName = 'Sheet.Content';

export const Sheet = { Root, Trigger, Content };
