'use client';
import { Switch as Base } from '@base-ui/react/switch';
import { forwardRef } from 'react';
import { cn } from './_utils';

export type SwitchProps = React.ComponentPropsWithoutRef<typeof Base.Root>;

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, ...props }, ref) => (
    <Base.Root
      ref={ref}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-ds-full transition-colors duration-ds-fast',
        'bg-ds-border data-[checked]:bg-ds-accent',
        'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40',
        className
      )}
      {...props}
    >
      <Base.Thumb className="h-4 w-4 translate-x-0.5 rounded-ds-full bg-ds-surface shadow transition-transform duration-ds-fast data-[checked]:translate-x-4" />
    </Base.Root>
  )
);
Switch.displayName = 'Switch';
