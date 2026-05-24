import { type HTMLAttributes } from 'react';
import { cn } from './_utils';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-ds-sm bg-ds-surface-muted', className)}
      {...props}
    />
  );
}
