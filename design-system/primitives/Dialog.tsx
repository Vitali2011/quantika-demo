'use client';
import { Dialog as Base } from '@base-ui/react/dialog';
import { forwardRef } from 'react';
import { cn } from './_utils';

const Root = Base.Root;
const Trigger = Base.Trigger;

const Content = forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup>
>(({ className, children, ...props }, ref) => (
  <Base.Portal>
    <Base.Backdrop className="fixed inset-0 z-40 bg-black/40 transition-opacity duration-ds-base" />
    <Base.Popup
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
        'rounded-ds-lg bg-ds-surface border border-ds-border shadow-xl p-6',
        className
      )}
      {...props}
    >
      {children}
    </Base.Popup>
  </Base.Portal>
));
Content.displayName = 'Dialog.Content';

const Title = forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof Base.Title>
>(({ className, ...props }, ref) => (
  <Base.Title ref={ref} className={cn('text-lg font-semibold text-ds-text mb-1', className)} {...props} />
));
Title.displayName = 'Dialog.Title';

const Description = forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof Base.Description>
>(({ className, ...props }, ref) => (
  <Base.Description
    ref={ref}
    className={cn('text-sm text-ds-text-muted mb-4', className)}
    {...props}
  />
));
Description.displayName = 'Dialog.Description';

export const Dialog = { Root, Trigger, Content, Title, Description };
