import type { ReactNode } from 'react';

/**
 * Minimal layout for /login — isolates from the main app layout.
 * No header, no nav, no providers that depend on session state.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#f8fafc',
        }}
      >
        {children}
      </body>
    </html>
  );
}
