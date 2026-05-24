import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './design-system/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ds: {
          bg: 'var(--ds-bg)',
          surface: 'var(--ds-surface)',
          'surface-muted': 'var(--ds-surface-muted)',
          border: 'var(--ds-border)',
          'border-strong': 'var(--ds-border-strong)',
          text: 'var(--ds-text)',
          'text-muted': 'var(--ds-text-muted)',
          'text-subtle': 'var(--ds-text-subtle)',
          accent: {
            DEFAULT: 'var(--ds-accent)',
            fg: 'var(--ds-accent-fg)',
            soft: 'var(--ds-accent-soft)',
            'soft-fg': 'var(--ds-accent-soft-fg)',
          },
          success: { DEFAULT: 'var(--ds-success)', soft: 'var(--ds-success-soft)' },
          warn: { DEFAULT: 'var(--ds-warn)', soft: 'var(--ds-warn-soft)' },
          danger: { DEFAULT: 'var(--ds-danger)', soft: 'var(--ds-danger-soft)' },
          info: { DEFAULT: 'var(--ds-info)', soft: 'var(--ds-info-soft)' },
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        'ds-sm': 'var(--ds-radius-sm)',
        'ds-md': 'var(--ds-radius-md)',
        'ds-lg': 'var(--ds-radius-lg)',
        'ds-full': 'var(--ds-radius-full)',
      },
      transitionDuration: {
        'ds-fast': 'var(--ds-motion-fast)',
        'ds-base': 'var(--ds-motion-base)',
        'ds-slow': 'var(--ds-motion-slow)',
      },
    },
  },
  plugins: [],
};

export default config;
