import type { SearchParams } from 'next/dist/server/request/search-params';

interface LoginPageProps {
  searchParams: SearchParams | Promise<SearchParams>;
}

/**
 * /login — server component, no client JS.
 * Renders a simple form that POSTs to /api/auth/login.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await Promise.resolve(searchParams);
  const hasError = 'error' in params && params.error === '1';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '1rem',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          padding: '2.5rem',
          width: '100%',
          maxWidth: '360px',
        }}
      >
        {/* Logo / Title */}
        <h1
          style={{
            margin: '0 0 0.25rem',
            fontSize: '1.5rem',
            fontWeight: 700,
            color: '#111827',
          }}
        >
          Quantika Demo
        </h1>
        <p style={{ margin: '0 0 1.75rem', color: '#6b7280', fontSize: '0.9rem' }}>
          Sign in to access the demo
        </p>

        {/* Error banner */}
        {hasError && (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '8px',
              color: '#dc2626',
              padding: '0.75rem 1rem',
              marginBottom: '1.25rem',
              fontSize: '0.875rem',
            }}
          >
            Invalid credentials. Please try again.
          </div>
        )}

        {/* Login form */}
        <form method="POST" action="/api/auth/login">
          {/* Hidden user field — single-user demo, username is fixed */}
          <input type="hidden" name="user" value="admin" />

          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                marginBottom: '0.4rem',
                fontWeight: 600,
                fontSize: '0.875rem',
                color: '#374151',
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '0.625rem 0.875rem',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '1rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
              placeholder="Enter demo password"
            />
          </div>

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.7rem',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '1rem',
              cursor: 'pointer',
            }}
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
