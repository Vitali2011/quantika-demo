# QUESTIONS / BLOCKERS

- [ ] Q001 [13:15] type=blocked path=/root/work/quantika-demo/.worktrees/qa-polish — #363 sitemap.xml blocked by middleware: `public/sitemap.xml` exists but middleware intercepts the request (not in AUTH_BYPASS_PATHS, not in matcher exclusion). curl https://demo.quantika.org/sitemap.xml redirects to /login. Fix: add `sitemap.xml` to middleware.ts matcher exclusion or AUTH_BYPASS_PATHS. Per admin-api.md rules, also add to middleware-auth.test.ts if using AUTH_BYPASS_PATHS. Deferred from Wave D — out of scope of current Phase 1 fixes.
