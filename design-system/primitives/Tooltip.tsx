'use client';
import { Tooltip as Base } from '@base-ui/react/tooltip';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Provider = Base.Provider;
const Root = Base.Root;
const Trigger = Base.Trigger;

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, ...props }, ref) => (
  <Base.Portal>
    <Base.Positioner sideOffset={6}>
      <Base.Popup
        ref={ref}
        className={cn(
          'z-50 rounded-ds-sm bg-ds-accent text-ds-accent-fg px-2 py-1 text-xs shadow-lg',
          className
        )}
        {...props}
      />
    </Base.Positioner>
  </Base.Portal>
));
Content.displayName = 'Tooltip.Content';

export const Tooltip = { Provider, Root, Trigger, Content };
