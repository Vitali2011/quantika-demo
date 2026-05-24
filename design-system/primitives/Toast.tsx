import { type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const toastVariants = cva(
  'fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 text-sm rounded-ds-md border shadow-lg',
  {
    variants: {
      variant: {
        default: 'bg-ds-surface text-ds-text border-ds-border',
        success: 'bg-ds-success-soft text-ds-success border-ds-success/20',
        danger: 'bg-ds-danger-soft text-ds-danger border-ds-danger/20',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface ToastProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof toastVariants> {
  open: boolean;
}

export function Toast({ open, className, variant, children, ...props }: ToastProps) {
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(toastVariants({ variant }), className)}
      {...props}
    >
      {children}
    </div>
  );
}
