import { type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const badgeVariants = cva(
  'inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-ds-sm border',
  {
    variants: {
      variant: {
        default: 'bg-ds-accent-soft text-ds-accent-soft-fg border-transparent',
        success: 'bg-ds-success-soft text-ds-success border-transparent',
        warn: 'bg-ds-warn-soft text-ds-warn border-transparent',
        danger: 'bg-ds-danger-soft text-ds-danger border-transparent',
        info: 'bg-ds-info-soft text-ds-info border-transparent',
        outline: 'bg-transparent text-ds-text-muted border-ds-border',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
