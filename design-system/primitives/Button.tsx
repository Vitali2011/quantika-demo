'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap rounded-ds-md ' +
    'transition-colors duration-ds-fast outline-none focus-visible:ring-2 focus-visible:ring-ds-accent/40 ' +
    'disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-ds-accent text-ds-accent-fg hover:bg-ds-accent/90',
        secondary: 'bg-ds-surface text-ds-text border border-ds-border hover:bg-ds-surface-muted',
        ghost: 'bg-transparent text-ds-text hover:bg-ds-surface-muted',
        danger: 'bg-ds-danger-soft text-ds-danger border border-ds-danger/20 hover:bg-ds-danger/10',
      },
      size: {
        sm: 'h-7 px-2.5 text-xs',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = 'Button';
