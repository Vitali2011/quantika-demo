import { cn } from './_utils';

export interface AvatarProps {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = { sm: 'h-6 w-6 text-[10px]', md: 'h-8 w-8 text-xs', lg: 'h-10 w-10 text-sm' };

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function Avatar({ name = '', src, size = 'md', className }: AvatarProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-ds-full bg-ds-accent-soft text-ds-accent-soft-fg font-bold overflow-hidden',
        sizeMap[size],
        className
      )}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}
