import { type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const pillVariants = cva(
  'inline-flex items-center px-2.5 py-0.5 text-xs font-bold rounded-ds-full',
  {
    variants: {
      variant: {
        default: 'bg-ds-accent-soft text-ds-accent-soft-fg',
        success: 'bg-ds-success-soft text-ds-success',
        warn: 'bg-ds-warn-soft text-ds-warn',
        danger: 'bg-ds-danger-soft text-ds-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface PillProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof pillVariants> {}

export function Pill({ className, variant, ...props }: PillProps) {
  return <span className={cn(pillVariants({ variant }), className)} {...props} />;
}
