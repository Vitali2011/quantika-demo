# Claude Code — Quantika Demo

Current code, `package.json`, and repository documentation are authoritative.

## Domain language

- Read [`CONTEXT.md`](CONTEXT.md) before domain work. It is the canonical freight
  glossary for TCE, voyage P&L, RAG scope, ports, demotion reasons, match buckets,
  and demo mode.
- Use the canonical terms from `CONTEXT.md` in variables, functions, and tests.
  Add a new durable term there in the same change that introduces it.
- Record a hard-to-reverse architecture decision under [`docs/adr/`](docs/adr/)
  using [`docs/adr/README.md`](docs/adr/README.md).

## Deployment facts

- Production uses the `quantika-demo` systemd unit. The legacy pm2 script
  `scripts/deploy-vps.sh` is not the production path.
- The `deploy.yml` workflow invokes `/root/deploy-quantika-demo.sh`, which updates
  itself from the canonical `ops/scripts/deploy-quantika-demo.sh`. Manual VPS code
  edits are overwritten by that flow.
- `NEXT_PUBLIC_*` values are embedded during `npm run build`; changing runtime
  configuration alone does not update client-side flags.
- A new route requires a complete build before its client reference manifest exists.

## Version-sensitive APIs

For Next.js, React, and shadcn APIs, verify the installed version in the repository
and use current official documentation rather than model memory.

Subsystem rules live in `.claude/rules/` and load themselves when you touch the files
they are scoped to.
