category: tech-stack
status: PARTIAL
findings:
  - question: "What is the actual tech stack of the project?"
    answer: |
      Framework: Next.js 14.2.35 (App Router, TypeScript, strict mode)
      UI: Tailwind CSS 3.4.19 + shadcn 4.1.2 + @radix-ui/react-slot 1.2.4 + @base-ui/react 1.3.0
      AI: openai SDK 6.33.0 (routed via ClipProxy at CLIPROXY_BASE_URL)
      Mail: googleapis 171.4.0 (Gmail API)
      Sessions: in-memory Map (lib/session.ts) — no database
      Deploy: PM2 + Caddy on VPS (per architecture.md)
      Test runner: jest 30.3.0 + ts-jest 29.4.9 (devDeps) — script: "jest --forceExit"
      TypeScript: 5.9.3
    source: package.json:1-41

  - question: "Is Jest actually configured? architecture.md says 'Jest (минимально настроен)' but is a config file present?"
    answer: "NOT_FOUND in /Users/jarvis/work/quantika-demo/jest.config* — no jest.config.js/ts/mjs exists. Jest + ts-jest are in devDeps and test script calls 'jest --forceExit', but zero configuration file. architecture.md claim is STALE."
    source: "NOT_FOUND in jest.config*; package.json:10,35,38"

  - question: "What tsconfig path aliases exist? (needed for Jest moduleNameMapper)"
    answer: 'paths: { "@/*": ["./*"] } — maps @/ to project root. moduleResolution: bundler, module: esnext, strict: true, isolatedModules: true'
    source: tsconfig.json:15-16

  - question: "What is the build-time behavior of withSentryConfig() in next.config.mjs when @sentry/nextjs is not yet installed?"
    answer: "NOT_FOUND: next.config.mjs does NOT contain withSentryConfig(). Current config exports plain nextConfig with typescript.ignoreBuildErrors=true and eslint.ignoreDuringBuilds=true only. @sentry/nextjs absent from package.json. Sentry integration (decomp-13) is entirely new work."
    source: "next.config.mjs:1-10; package.json:13-27"

  - question: "What environment variables does the project use?"
    answer: |
      GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (OAuth)
      CLIPROXY_API_KEY, CLIPROXY_BASE_URL (AI proxy, default http://localhost:8317/v1)
      AI_MODEL_HEAVY (example: gpt-5.4), AI_MODEL_LIGHT (example: gpt-5.3-codex)
      NEXT_PUBLIC_APP_URL (example: https://demo.quantika.org)
      SENTRY_DSN — NOT in .env.local.example (decomp-13 plans to add)
    source: .env.local.example:1-7

  - question: "What npm audit vulnerabilities exist?"
    answer: "INFERRED: 4 HIGH + 1 MODERATE per npm audit. Exact CVEs not in decomp files — only counts stated."
    source: "INFERRED: decomp-06.md:9; architecture.md:70"
