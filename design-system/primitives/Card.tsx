import { forwardRef, type HTMLAttributes } from 'react';
import { cn, cva, type VariantProps } from './_utils';

const cardVariants = cva('bg-ds-surface border border-ds-border rounded-ds-md', {
  variants: {
    padding: { none: '', sm: 'p-3', md: 'p-4', lg: 'p-6' },
    interactive: {
      true: 'transition-colors duration-ds-fast hover:bg-ds-surface-muted cursor-pointer',
      false: '',
    },
  },
  defaultVariants: { padding: 'md', interactive: false },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding, interactive, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ padding, interactive }), className)} {...props} />
  )
);
Card.displayName = 'Card';
