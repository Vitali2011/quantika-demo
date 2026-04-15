total_files: 67
entry_points:
  - path: app/layout.tsx
    role: Next.js root layout (fonts, globals, metadata)
  - path: app/page.tsx
    role: root landing/home page
  - path: next.config.mjs
    role: Next.js configuration entrypoint

configs:
  - path: package.json
    role: deps + npm scripts
  - path: tsconfig.json
    role: TypeScript compiler config
  - path: tailwind.config.ts
    role: Tailwind CSS configuration
  - path: next.config.mjs
    role: Next.js build configuration
  - path: postcss.config.mjs
    role: PostCSS/Tailwind pipeline
  - path: .eslintrc.json
    role: ESLint rules
  - path: components.json
    role: shadcn/ui component registry config
  - path: ecosystem.config.js
    role: PM2 process manager config for production
  - path: .env.local.example
    role: environment variable template
  - path: ops/Caddyfile.demo.quantika.org
    role: Caddy reverse proxy config for demo deployment
  - path: scripts/setup.sh
    role: one-time environment setup script

packages:
  - path: app/api/ai/
    description: AI/LLM API routes — each wraps an OpenAI call for a specific domain task
    key_files:
      - classify/route.ts
      - counterparty/route.ts
      - draft-quote/route.ts
      - draft-reply/route.ts
      - match/route.ts
      - parse-cargo/route.ts
      - parse-recap/route.ts
      - parse-vessel/route.ts
      - recap/route.ts

  - path: app/api/
    description: Non-AI API routes — auth, email fetch, session management, sample data
    key_files:
      - auth/google/route.ts
      - emails/fetch/route.ts
      - sample/route.ts
      - session/route.ts

  - path: app/
    description: Next.js App Router pages — UI pages for each domain entity
    key_files:
      - page.tsx
      - layout.tsx
      - globals.css
      - dashboard/page.tsx
      - dashboard/ScrollLink.tsx
      - cargo/[id]/page.tsx
      - vessel/[id]/page.tsx
      - fixture/[id]/page.tsx
      - match/[id]/page.tsx
      - recap/[id]/page.tsx
      - commission/page.tsx
      - processing/page.tsx
      - summary/page.tsx

  - path: components/
    description: React UI components — domain-specific and shadcn/ui base components
    key_files:
      - connect-gmail-button.tsx
      - copy-button.tsx
      - progress-processing.tsx
      - recap/recap-actions.tsx
      - recap/recap-section.tsx
      - request/draft-quote-card.tsx
      - ui/alert.tsx
      - ui/badge.tsx
      - ui/button.tsx
      - ui/card.tsx
      - ui/progress.tsx
      - ui/separator.tsx
      - ui/skeleton.tsx
      - ui/table.tsx

  - path: lib/
    description: Business logic, types, utilities, and third-party client wrappers
    key_files:
      - types.ts
      - constants.ts
      - currency.ts
      - commission.ts
      - counterparty.ts
      - freshness.ts
      - prompts.ts
      - openai.ts
      - google.ts
      - session.ts
      - utils.ts
      - __tests__/currency.test.ts

  - path: docs/
    description: Developer documentation for deployment and OAuth setup
    key_files:
      - deploy.md
      - google-oauth-setup.md

notes:
  - Next.js 14+ App Router project (TypeScript, Tailwind, shadcn/ui)
  - Domain model covers maritime freight brokerage: cargo requests, vessels, fixtures, recaps, matches, commission
  - All AI features go through lib/openai.ts + lib/prompts.ts; routes in app/api/ai/ are thin wrappers
  - Authentication is Google OAuth via app/api/auth/google/route.ts + lib/google.ts + lib/session.ts
  - Currency utilities in lib/currency.ts are the only tested module (lib/__tests__/currency.test.ts)
  - No database layer visible — data likely comes from email parsing + in-memory/session state
  - PM2 + Caddy used for production deployment on demo server
