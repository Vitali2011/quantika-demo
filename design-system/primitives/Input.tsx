'use client';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './_utils';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-9 w-full rounded-ds-md border border-ds-border bg-ds-surface px-3 text-sm text-ds-text',
        'placeholder:text-ds-text-subtle',
        'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 focus-visible:border-ds-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        'aria-[invalid=true]:border-ds-danger aria-[invalid=true]:ring-ds-danger/30',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';
