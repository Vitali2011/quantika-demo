'use client';
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from './_utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-ds-md border border-ds-border bg-ds-surface px-3 py-2 text-sm text-ds-text',
        'placeholder:text-ds-text-subtle',
        'outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 focus-visible:border-ds-accent',
        'disabled:opacity-50 disabled:pointer-events-none',
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
